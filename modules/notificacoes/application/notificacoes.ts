import { err, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { exigeConsentimento } from '../domain/consentimento.js';
import { Notificacao, TIPOS_DE_NOTIFICACAO } from '../domain/notificacao.js';

import { renderizar, TEMPLATES } from './templates.js';

import type {
  DestinosDoUsuario,
  EnviadorDeCanal,
  ListaDeSupressao,
  PreferenciasDeNotificacao,
  RepositorioDeConsentimentos,
  RepositorioDeNotificacoes,
} from './portas.js';
import type { Canal, MotivoDeRejeicao } from '../domain/notificacao.js';
import type { EventoEntrega } from '@pz/integracoes';
import type { Clock, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

export const PedidoDeNotificacao = z
  .object({
    tipo: z.enum(TIPOS_DE_NOTIFICACAO),
    tenantId: z.uuid(),
    usuarioId: z.uuid(),
    prazoId: z.uuid().optional(),
    /** Janela da idempotência (ex.: o dia do lembrete, AAAA-MM-DD). */
    janela: z.string().min(1).max(40),
    dados: z.unknown(),
  })
  .strict();

export type ResultadoDoPedido =
  | { readonly solicitada: true; readonly notificacaoId: Uuid }
  | {
      readonly solicitada: false;
      readonly motivo: 'ja-solicitada' | 'desativada' | 'sem-destinatario';
    };

/**
 * Pede uma notificação (HU30): resolve preferência e destinatários, valida os dados no template e
 * grava a notificação e o evento na mesma transação; o worker envia. No e-mail, os endereços do
 * usuário sem os suprimidos; nos outros canais, só destinos com consentimento ativo (ADR-015).
 * Canal novo = novo enviador e opção nas preferências, sem mudar este caso de uso.
 */
export class Notificar<Transacao> {
  constructor(
    private readonly notificacoes: RepositorioDeNotificacoes<Transacao>,
    private readonly preferencias: PreferenciasDeNotificacao<Transacao>,
    private readonly destinos: DestinosDoUsuario<Transacao>,
    private readonly supressao: ListaDeSupressao<Transacao>,
    private readonly consentimentos: RepositorioDeConsentimentos<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    transacao: Transacao,
    entrada: unknown,
    canal: Canal = 'email',
  ): Promise<Result<ResultadoDoPedido, Validacao>> {
    const pedido = PedidoDeNotificacao.safeParse(entrada);
    if (!pedido.success) return err(problemas(pedido.error));
    const { tipo, usuarioId, tenantId, prazoId, janela } = pedido.data;
    const dados = TEMPLATES[tipo].dados.safeParse(pedido.data.dados);
    if (!dados.success) return err(problemas(dados.error, 'dados'));

    const uid = usuarioId as Uuid;
    if ((await this.preferencias.ativo(transacao, uid, tipo, canal)) === false)
      return ok({ solicitada: false, motivo: 'desativada' });
    const destinatarios = exigeConsentimento(canal)
      ? [...new Set(await this.consentimentos.enderecos(transacao, uid, canal))]
      : await this.#emails(transacao, uid);
    if (destinatarios.length === 0) return ok({ solicitada: false, motivo: 'sem-destinatario' });

    const notificacao = Notificacao.solicitar(
      {
        tenantId: tenantId as Uuid,
        usuarioId: uid,
        ...(prazoId === undefined ? {} : { prazoId: prazoId as Uuid }),
        canal,
        tipo,
        versaoTemplate: TEMPLATES[tipo].versao,
        destinatarios,
        dados: dados.data,
        janela,
      },
      this.relogio,
    );
    if (!(await this.notificacoes.inserir(transacao, notificacao)))
      return ok({ solicitada: false, motivo: 'ja-solicitada' });
    await this.outbox.gravar(transacao, notificacao.retirarEventos());
    return ok({ solicitada: true, notificacaoId: notificacao.id });
  }

  async #emails(transacao: Transacao, usuarioId: Uuid): Promise<string[]> {
    const { principal, copias } = await this.destinos.emails(transacao, usuarioId);
    const todos = [
      ...new Set(
        [principal, ...copias]
          .filter((e): e is string => e !== undefined)
          .map((e) => e.trim().toLowerCase()),
      ),
    ];
    const suprimidos = await this.supressao.suprimidos(transacao, todos);
    return todos.filter((e) => !suprimidos.has(e));
  }
}

/**
 * Envia a notificação solicitada (consumidor de NotificacaoSolicitada). Idempotente: já enviada
 * não sai de novo, e o provedor recebe a chave de idempotência da notificação.
 */
export class EnviarNotificacao<Transacao> {
  constructor(
    private readonly notificacoes: RepositorioDeNotificacoes<Transacao>,
    private readonly enviadores: Partial<Record<Canal, EnviadorDeCanal>>,
    private readonly relogio: Clock,
  ) {}

  async executar(transacao: Transacao, notificacaoId: Uuid): Promise<void> {
    const notificacao = await this.notificacoes.buscar(transacao, notificacaoId);
    if (notificacao === undefined) throw new Error(`Notificação ${notificacaoId} não encontrada`);
    if (notificacao.enviada) return;
    const { canal, tipo, dados, chave, destinatarios } = notificacao.estado;
    const enviador = this.enviadores[canal];
    // Nada falha em silêncio: sem enviador o evento vai para a DLQ com o motivo.
    if (enviador === undefined) throw new Error(`Canal ${canal} sem enviador configurado`);
    const resultado = await enviador.enviar({
      idempotencia: chave,
      destinatarios,
      mensagem: renderizar(tipo, dados, canal, enviador.capacidades),
    });
    notificacao.registrarEnvio(resultado.idExterno, this.relogio.agora());
    await this.notificacoes.registrarEnvio(transacao, notificacao);
  }
}

export interface ResumoDosDesfechos {
  /** Rejeições novas (já gravadas e com evento), para métrica e alerta ao administrador. */
  readonly rejeicoes: readonly MotivoDeRejeicao[];
  /** Desfechos de envios fora da tabela de notificações (ex.: avisos de segurança). */
  readonly semNotificacao: number;
}

/**
 * Aplica os eventos de entrega do provedor (webhook, HU30). Rejeição permanente e reclamação
 * entram na lista de supressão mesmo sem notificação correspondente; a notificação recebe o
 * desfecho e publica NotificacaoEntregue ou NotificacaoRejeitada. Idempotente.
 */
export class RegistrarDesfechosDeEntrega<Transacao> {
  constructor(
    private readonly notificacoes: RepositorioDeNotificacoes<Transacao>,
    private readonly supressao: ListaDeSupressao<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    transacao: Transacao,
    eventos: readonly EventoEntrega[],
  ): Promise<ResumoDosDesfechos> {
    const rejeicoes: MotivoDeRejeicao[] = [];
    let semNotificacao = 0;
    for (const evento of eventos) {
      const motivoDeSupressao = SUPRIME[evento.tipo];
      if (motivoDeSupressao !== undefined && evento.destinatarios !== undefined) {
        const emails = evento.destinatarios.map((e) => e.trim().toLowerCase());
        await this.supressao.suprimir(transacao, emails, motivoDeSupressao);
      }
      const notificacao = await this.notificacoes.buscarPorIdExterno(transacao, evento.idExterno);
      if (notificacao === undefined) {
        semNotificacao += 1;
        continue;
      }
      if (!notificacao.registrarDesfecho(evento, this.relogio)) continue;
      await this.notificacoes.registrarDesfecho(transacao, notificacao);
      const novos = notificacao.retirarEventos();
      for (const e of novos)
        if (e.tipo === 'NotificacaoRejeitada') rejeicoes.push(e.payload.motivo);
      await this.outbox.gravar(transacao, novos);
    }
    return { rejeicoes, semNotificacao };
  }
}

export interface AvisosDeEntrega {
  /** E-mails do usuário na lista de supressão: não recebem nada até o suporte liberar. */
  readonly emailsRejeitados: readonly string[];
  /** Usuários do escritório com rejeição na janela; `null` para quem não administra a equipe. */
  readonly usuariosDaEquipeComRejeicao: number | null;
}

/** Janela do aviso à equipe: rejeições da última semana (HU30). */
export const JANELA_DO_AVISO_A_EQUIPE_MS = 7 * 24 * 3600 * 1000;

/**
 * Avisos de entrega para a faixa do portal (HU30: "rejeição gera aviso no portal e ao
 * administrador"). O usuário vê os próprios e-mails suprimidos; quem administra a equipe vê
 * também quantos colegas tiveram rejeição recente. Consulta derivada do estado, sem dispensa:
 * o aviso some quando o e-mail é trocado ou liberado.
 */
export class ConsultarAvisosDeEntrega<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly notificacoes: RepositorioDeNotificacoes<Transacao>,
    private readonly destinos: DestinosDoUsuario<Transacao>,
    private readonly supressao: ListaDeSupressao<Transacao>,
    private readonly relogio: Clock,
  ) {}

  executar(usuarioId: Uuid, administraEquipe: boolean): Promise<AvisosDeEntrega> {
    return this.unidade.executar(async (transacao) => {
      const { principal, copias } = await this.destinos.emails(transacao, usuarioId);
      const emails = [
        ...new Set(
          [principal, ...copias]
            .filter((e): e is string => e !== undefined)
            .map((e) => e.trim().toLowerCase()),
        ),
      ];
      const suprimidos = await this.supressao.suprimidos(transacao, emails);
      const desde = this.relogio.agora().maisMs(-JANELA_DO_AVISO_A_EQUIPE_MS);
      return {
        emailsRejeitados: emails.filter((e) => suprimidos.has(e)),
        usuariosDaEquipeComRejeicao: administraEquipe
          ? await this.notificacoes.usuariosComRejeicaoDesde(transacao, desde)
          : null,
      };
    });
  }
}

const SUPRIME: Partial<Record<EventoEntrega['tipo'], 'bounce' | 'spam'>> = {
  rejeitado: 'bounce',
  reclamacao: 'spam',
};

function problemas(erro: z.ZodError, prefixo?: string): Validacao {
  return new Validacao(
    erro.issues.map((p) => ({
      campo: [prefixo, ...p.path].filter((x) => x !== undefined).join('.'),
      mensagem: p.message,
    })),
  );
}
