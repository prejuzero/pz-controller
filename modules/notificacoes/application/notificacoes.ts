import { AnexoDeEmail } from '@pz/integracoes';
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
import type { Canal, MotivoDeRejeicao, TipoDeNotificacao } from '../domain/notificacao.js';
import type { ArmazenamentoArquivos, EventoEntrega } from '@pz/integracoes';
import type { Clock, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Teto de destinatários de um envio manual (HU32). */
export const MAXIMO_DE_DESTINATARIOS = 10;

export const PedidoDeNotificacao = z
  .object({
    tipo: z.enum(TIPOS_DE_NOTIFICACAO),
    tenantId: z.uuid(),
    usuarioId: z.uuid(),
    prazoId: z.uuid().optional(),
    /** Janela da idempotência (ex.: o dia do lembrete, AAAA-MM-DD). */
    janela: z.string().min(1).max(40),
    dados: z.unknown(),
    /**
     * Envio manual (HU32): endereços escolhidos por quem envia, no lugar dos do usuário. Não passa
     * pelas preferências (o envio é um pedido explícito), mas respeita a lista de supressão.
     */
    destinatarios: z.array(z.email()).min(1).max(MAXIMO_DE_DESTINATARIOS).optional(),
    anexo: z
      .object({
        caminho: z.string().min(1).max(900),
        nome: z.string().min(1).max(120),
        tipoMime: z.string().min(1).max(120),
      })
      .strict()
      .optional(),
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
    const { tipo, usuarioId, tenantId, prazoId, janela, anexo } = pedido.data;
    const dados = TEMPLATES[tipo].dados.safeParse(pedido.data.dados);
    if (!dados.success) return err(problemas(dados.error, 'dados'));
    const explicitos = pedido.data.destinatarios;
    if (explicitos !== undefined && canal !== 'email')
      return err(new Validacao([{ campo: 'destinatarios', mensagem: 'Só no e-mail.' }]));

    const uid = usuarioId as Uuid;
    if (
      explicitos === undefined &&
      (await this.preferencias.ativo(transacao, uid, tipo, canal)) === false
    )
      return ok({ solicitada: false, motivo: 'desativada' });
    const destinatarios =
      explicitos !== undefined
        ? await this.#semSuprimidos(transacao, explicitos)
        : exigeConsentimento(canal)
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
        ...(anexo === undefined ? {} : { anexo }),
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
    return this.#semSuprimidos(
      transacao,
      [principal, ...copias].filter((e): e is string => e !== undefined),
    );
  }

  async #semSuprimidos(transacao: Transacao, emails: readonly string[]): Promise<string[]> {
    const todos = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
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
    private readonly linkDeCiencia?: LinkDeCienciaNoEnvio<Transacao>,
    private readonly arquivos?: Pick<ArmazenamentoArquivos, 'ler'>,
  ) {}

  async executar(transacao: Transacao, notificacaoId: Uuid): Promise<void> {
    const notificacao = await this.notificacoes.buscar(transacao, notificacaoId);
    if (notificacao === undefined) throw new Error(`Notificação ${notificacaoId} não encontrada`);
    if (notificacao.enviada) return;
    const { canal, tipo, dados, chave, destinatarios, versaoTemplate } = notificacao.estado;
    // A notificação sai na versão em que foi pedida; versão retirada vai para a DLQ com o motivo.
    if (versaoTemplate !== TEMPLATES[tipo].versao)
      throw new Error(`Template ${tipo} v${String(versaoTemplate)} não está mais disponível`);
    const enviador = this.enviadores[canal];
    // Nada falha em silêncio: sem enviador o evento vai para a DLQ com o motivo.
    if (enviador === undefined) throw new Error(`Canal ${canal} sem enviador configurado`);
    const anexos = await this.#anexos(notificacao);
    const resultado = await enviador.enviar({
      idempotencia: chave,
      destinatarios,
      ...(anexos === undefined ? {} : { anexos }),
      mensagem: await renderizar(
        tipo,
        await this.#comCiencia(transacao, notificacao, dados),
        canal,
        enviador.capacidades,
      ),
    });
    notificacao.registrarEnvio(resultado.idExterno, this.relogio.agora());
    await this.notificacoes.registrarEnvio(transacao, notificacao);
  }

  /** Anexo do envio manual (HU32), lido do armazenamento do tenant; sumido vai para a DLQ. */
  async #anexos(notificacao: Notificacao): Promise<AnexoDeEmail[] | undefined> {
    const { anexo, tenantId, canal } = notificacao.estado;
    if (anexo === undefined) return undefined;
    if (canal !== 'email' || this.arquivos === undefined)
      throw new Error(`Anexo sem leitor de arquivos no canal ${canal}`);
    const conteudo = await this.arquivos.ler(tenantId, anexo.caminho);
    if (conteudo === undefined) throw new Error(`Anexo ${anexo.caminho} não encontrado`);
    return [AnexoDeEmail.parse({ nome: anexo.nome, tipoMime: anexo.tipoMime, conteudo })];
  }

  /**
   * E-mail de prazo com "Confirmar ciência" (HU33): o link é gerado agora, no envio; o token não
   * fica gravado na notificação (só o hash, no módulo ciencia). Reenvio gera outro e revoga o anterior.
   */
  async #comCiencia(transacao: Transacao, notificacao: Notificacao, dados: unknown) {
    const { tipo, canal, prazoId, tenantId, usuarioId } = notificacao.estado;
    if (this.linkDeCiencia === undefined || prazoId === undefined || canal !== 'email')
      return dados;
    if (!TIPOS_COM_CIENCIA.includes(tipo)) return dados;
    const linkCiencia = await this.linkDeCiencia(transacao, { tenantId, prazoId, usuarioId });
    return { ...(dados as object), linkCiencia };
  }
}

/** Porta: gera o link de ciência no envio (módulo ciencia, na composição). */
export type LinkDeCienciaNoEnvio<Transacao> = (
  transacao: Transacao,
  p: { tenantId: Uuid; prazoId: Uuid; usuarioId: Uuid },
) => Promise<string>;

/** Tipos cujo e-mail traz "Confirmar ciência" (o template aceita `linkCiencia`). */
const TIPOS_COM_CIENCIA: readonly TipoDeNotificacao[] = [
  'nova-intimacao',
  'lembrete-prazo',
  'prazo-recalculado',
];

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
