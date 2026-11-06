import { ErroTransitorio } from '@pz/integracoes';
import { Conflito, err, gerarUuidV7, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import {
  desfechoDoStatus,
  enderecoDaAssinatura,
  EVENTO_DE_TESTE,
  eventoPublicoDe,
  eventosDaAssinatura,
} from '../domain/eventos-publicos.js';

import type {
  Assinatura,
  Autor,
  CifraDoSegredo,
  Criptografia,
  Entrega,
  RepositorioDeAssinaturas,
  RepositorioDeEntregas,
} from './portas.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { EntregadorWebhook, EntregaWebhook } from '@pz/integracoes';
import type { Clock, EventoDominio, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

export interface DependenciasDosWebhooks<Transacao> {
  readonly unidade: UnidadeDeTrabalho<Transacao>;
  readonly assinaturas: RepositorioDeAssinaturas<Transacao>;
  readonly entregas: RepositorioDeEntregas<Transacao>;
  readonly trilha: TrilhaDeAuditoria<Transacao>;
  readonly outbox: Outbox<Transacao>;
  readonly cifra: CifraDoSegredo;
  readonly criptografia: Criptografia;
  readonly relogio: Clock;
}

/** Cabeçalhos do webhook (ADR-023): o integrador confere a assinatura e deduplica pelo id. */
export const CABECALHO_ASSINATURA = 'prejuzero-assinatura';
export const CABECALHO_EVENTO = 'prejuzero-evento-id';
export const CABECALHO_TIPO = 'prejuzero-evento-tipo';

export function assinaturaPublica(a: Assinatura) {
  return {
    id: a.id,
    url: a.url,
    descricao: a.descricao,
    eventos: [...a.eventos],
    criadoEm: a.criadoEm.paraIso(),
    desativadaEm: a.desativadaEm?.paraIso() ?? null,
  };
}
export type AssinaturaPublica = ReturnType<typeof assinaturaPublica>;

export function entregaPublica(e: Entrega) {
  return {
    id: e.id,
    assinaturaId: e.assinaturaId,
    eventoId: e.eventoId,
    tipo: e.tipo,
    situacao: e.situacao,
    tentativas: e.tentativas,
    ultimoStatus: e.ultimoStatus,
    ultimoErro: e.ultimoErro,
    criadoEm: e.criadoEm.paraIso(),
    entregueEm: e.entregueEm?.paraIso() ?? null,
  };
}
export type EntregaPublica = ReturnType<typeof entregaPublica>;

const EntradaDaAssinatura = z
  .object({
    url: z.string().min(1).max(2000),
    descricao: z.string().trim().min(1).max(100),
    eventos: z.array(z.string().max(64)).min(1).max(20),
  })
  .strict();

const validacao = (erro: z.ZodError) =>
  new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));

function agendada(relogio: Clock, entrega: Entrega): EventoDominio {
  return {
    id: gerarUuidV7(relogio),
    tipo: 'EntregaWebhookAgendada',
    versao: 1,
    tenantId: entrega.tenantId,
    agregadoId: entrega.id,
    ocorridoEm: relogio.agora(),
    payload: { entregaId: entrega.id },
  };
}

/** POST /v1/integracoes/webhooks: o segredo de assinatura aparece uma única vez. */
export class RegistrarAssinatura<Transacao> {
  constructor(
    private readonly deps: DependenciasDosWebhooks<Transacao>,
    private readonly exigirHttps: boolean,
  ) {}

  async executar(
    autor: Autor,
    entrada: unknown,
  ): Promise<Result<{ assinatura: AssinaturaPublica; segredo: string }, Validacao>> {
    const dados = EntradaDaAssinatura.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const url = enderecoDaAssinatura(dados.data.url, this.exigirHttps);
    if (!url.ok) return url;
    const eventos = eventosDaAssinatura(dados.data.eventos);
    if (!eventos.ok) return eventos;
    const { relogio, criptografia, cifra } = this.deps;
    const segredo = criptografia.novoSegredo();
    const assinatura: Assinatura = {
      id: gerarUuidV7(relogio),
      tenantId: autor.tenantId,
      url: url.valor,
      descricao: dados.data.descricao,
      eventos: eventos.valor,
      segredoCifrado: cifra.cifrar(segredo),
      criadoPor: autor.usuarioId,
      criadoEm: relogio.agora(),
      desativadaEm: null,
    };
    const publica = assinaturaPublica(assinatura);
    await this.deps.unidade.executar(async (tx) => {
      await this.deps.assinaturas.inserir(tx, assinatura);
      // Sem o segredo na trilha.
      await this.deps.trilha.registrar(
        tx,
        {
          tipo: 'webhooks.assinatura-registrada',
          entidade: 'assinatura_webhook',
          entidadeId: assinatura.id,
          depois: { url: publica.url, eventos: publica.eventos },
        },
        { canal: autor.canal, usuarioId: autor.usuarioId },
      );
    });
    return ok({ assinatura: publica, segredo });
  }
}

export class ListarAssinaturas<Transacao> {
  constructor(private readonly deps: DependenciasDosWebhooks<Transacao>) {}

  async executar(): Promise<AssinaturaPublica[]> {
    const lista = await this.deps.unidade.executar((tx) => this.deps.assinaturas.listar(tx));
    return lista.map(assinaturaPublica);
  }
}

export class DesativarAssinatura<Transacao> {
  constructor(private readonly deps: DependenciasDosWebhooks<Transacao>) {}

  executar(autor: Autor, id: Uuid): Promise<Result<void, NaoEncontrado>> {
    return this.deps.unidade.executar(async (tx) => {
      if (!(await this.deps.assinaturas.desativar(tx, id, this.deps.relogio.agora()))) {
        return err(new NaoEncontrado('assinatura-nao-encontrada', 'Webhook não encontrado.'));
      }
      await this.deps.trilha.registrar(
        tx,
        { tipo: 'webhooks.assinatura-desativada', entidade: 'assinatura_webhook', entidadeId: id },
        { canal: autor.canal, usuarioId: autor.usuarioId },
      );
      return ok(undefined);
    });
  }
}

export class ListarEntregas<Transacao> {
  constructor(private readonly deps: DependenciasDosWebhooks<Transacao>) {}

  async executar(filtro: { assinaturaId?: Uuid; limite?: number }): Promise<EntregaPublica[]> {
    const limite = Math.min(Math.max(filtro.limite ?? 50, 1), 200);
    const lista = await this.deps.unidade.executar((tx) =>
      this.deps.entregas.listar(tx, {
        limite,
        ...(filtro.assinaturaId === undefined ? {} : { assinaturaId: filtro.assinaturaId }),
      }),
    );
    return lista.map(entregaPublica);
  }
}

function novaEntrega(
  relogio: Clock,
  assinatura: Assinatura,
  evento: { id: Uuid; tipo: string; ocorridoEm: Entrega['ocorridoEm']; dados: Entrega['dados'] },
): Entrega {
  return {
    id: gerarUuidV7(relogio),
    tenantId: assinatura.tenantId,
    assinaturaId: assinatura.id,
    eventoId: evento.id,
    tipo: evento.tipo,
    ocorridoEm: evento.ocorridoEm,
    dados: evento.dados,
    situacao: 'pendente',
    tentativas: 0,
    ultimoStatus: null,
    ultimoErro: null,
    entregueEm: null,
    criadoEm: relogio.agora(),
  };
}

/**
 * Do evento de domínio às entregas (consumidor no worker): uma por assinatura ativa do tenant
 * que pediu o evento, na transação do consumo. Repetir o evento não cria outra.
 */
export class RegistrarEntregas<Transacao> {
  constructor(private readonly deps: DependenciasDosWebhooks<Transacao>) {}

  async executar(tx: Transacao, evento: EventoDominio): Promise<Uuid[]> {
    const publico = eventoPublicoDe(evento.tipo, evento.payload as Record<string, unknown>);
    if (publico === undefined) return [];
    const ids: Uuid[] = [];
    for (const assinatura of await this.deps.assinaturas.ativasDoEvento(tx, publico.tipo)) {
      const entrega = novaEntrega(this.deps.relogio, assinatura, {
        id: evento.id,
        tipo: publico.tipo,
        ocorridoEm: evento.ocorridoEm,
        dados: publico.dados,
      });
      if (await this.deps.entregas.inserirSeNova(tx, entrega)) ids.push(entrega.id);
    }
    return ids;
  }
}

/** Botão "testar": entrega `webhook.teste` na hora, pelo mesmo caminho das demais. */
export class TestarAssinatura<Transacao> {
  constructor(private readonly deps: DependenciasDosWebhooks<Transacao>) {}

  executar(_autor: Autor, id: Uuid): Promise<Result<EntregaPublica, NaoEncontrado | Conflito>> {
    const { relogio } = this.deps;
    return this.deps.unidade.executar(async (tx) => {
      const assinatura = await this.deps.assinaturas.buscar(tx, id);
      if (assinatura === undefined) {
        return err(new NaoEncontrado('assinatura-nao-encontrada', 'Webhook não encontrado.'));
      }
      if (assinatura.desativadaEm !== null) {
        return err(new Conflito('assinatura-desativada', 'Webhook desativado.'));
      }
      const entrega = novaEntrega(relogio, assinatura, {
        id: gerarUuidV7(relogio),
        tipo: EVENTO_DE_TESTE,
        ocorridoEm: relogio.agora(),
        dados: {},
      });
      await this.deps.entregas.inserirSeNova(tx, entrega);
      await this.deps.outbox.gravar(tx, [agendada(relogio, entrega)]);
      return ok(entregaPublica(entrega));
    });
  }
}

/** Reenvio manual de uma entrega que falhou (fila de falhas na tela), com trilha. */
export class ReenviarEntrega<Transacao> {
  constructor(private readonly deps: DependenciasDosWebhooks<Transacao>) {}

  executar(autor: Autor, id: Uuid): Promise<Result<void, NaoEncontrado | Conflito>> {
    return this.deps.unidade.executar(async (tx) => {
      const entrega = await this.deps.entregas.buscar(tx, id);
      if (entrega === undefined) {
        return err(new NaoEncontrado('entrega-nao-encontrada', 'Entrega não encontrada.'));
      }
      if (!(await this.deps.entregas.reabrir(tx, id))) {
        return err(new Conflito('entrega-nao-falhou', 'Só uma entrega que falhou é reenviada.'));
      }
      await this.deps.trilha.registrar(
        tx,
        { tipo: 'webhooks.entrega-reenviada', entidade: 'entrega_webhook', entidadeId: id },
        { canal: autor.canal, usuarioId: autor.usuarioId },
      );
      await this.deps.outbox.gravar(tx, [agendada(this.deps.relogio, entrega)]);
      return ok(undefined);
    });
  }
}

export type DesfechoDaEntrega = 'entregue' | 'recusada' | 'ignorada';

/**
 * Envia uma entrega (job da fila `integracoes`): corpo canônico, assinatura HMAC sobre
 * `t.corpo` e o desfecho gravado a cada tentativa. Falha passageira lança `ErroTransitorio`
 * para a fila tentar de novo; esgotadas as tentativas, `esgotar` marca a entrega como falha.
 */
export class EntregarWebhook<Transacao> {
  constructor(
    private readonly deps: DependenciasDosWebhooks<Transacao>,
    private readonly entregador: EntregadorWebhook,
  ) {}

  async executar(id: Uuid): Promise<DesfechoDaEntrega> {
    const { unidade, entregas, assinaturas, relogio } = this.deps;
    const carregado = await unidade.executar(async (tx) => {
      const entrega = await entregas.buscar(tx, id);
      if (entrega === undefined) return undefined;
      return { entrega, assinatura: await assinaturas.buscar(tx, entrega.assinaturaId) };
    });
    // Ainda não visível (o job saiu antes do commit do consumo): a fila tenta de novo.
    if (carregado === undefined) throw new ErroTransitorio('entrega ainda não gravada', 'webhooks');
    const { entrega, assinatura } = carregado;
    if (entrega.situacao !== 'pendente' || assinatura === undefined) return 'ignorada';
    if (assinatura.desativadaEm !== null) return 'ignorada';

    const corpo = JSON.stringify({
      id: entrega.eventoId,
      tipo: entrega.tipo,
      versao: 1,
      ocorridoEm: entrega.ocorridoEm.paraIso(),
      dados: entrega.dados,
    });
    const segundos = Math.floor(relogio.agora().epochMs / 1000);
    const segredo = this.deps.cifra.decifrar(assinatura.segredoCifrado);
    const assinado = this.deps.criptografia.hmac(segredo, `${String(segundos)}.${corpo}`);
    const pedido: EntregaWebhook = {
      url: assinatura.url,
      corpo,
      cabecalhos: {
        [CABECALHO_ASSINATURA]: `t=${String(segundos)},v1=${assinado}`,
        [CABECALHO_EVENTO]: entrega.eventoId,
        [CABECALHO_TIPO]: entrega.tipo,
      },
    };
    const resultado = await this.entregador.entregar(pedido);
    const desfecho =
      resultado.tipo === 'resposta' ? desfechoDoStatus(resultado.status) : 'tentar-de-novo';
    const status = resultado.tipo === 'resposta' ? resultado.status : null;
    const erro =
      resultado.tipo === 'falha'
        ? resultado.motivo
        : desfecho === 'entregue'
          ? null
          : `HTTP ${String(resultado.status)}`;
    await unidade.executar((tx) =>
      entregas.registrarTentativa(tx, id, {
        situacao:
          desfecho === 'entregue' ? 'entregue' : desfecho === 'recusada' ? 'falhou' : 'pendente',
        status,
        erro,
        agora: relogio.agora(),
        enviou: true,
      }),
    );
    if (desfecho === 'tentar-de-novo') {
      throw new ErroTransitorio(`webhook não entregue: ${erro ?? 'sem resposta'}`, 'webhooks');
    }
    return desfecho;
  }

  /** Tentativas esgotadas: a entrega vai para a fila de falhas da tela (reenvio manual). */
  async esgotar(id: Uuid, motivo: string): Promise<void> {
    const { unidade, entregas, relogio } = this.deps;
    await unidade.executar(async (tx) => {
      const entrega = await entregas.buscar(tx, id);
      if (entrega?.situacao !== 'pendente') return;
      await entregas.registrarTentativa(tx, id, {
        situacao: 'falhou',
        status: entrega.ultimoStatus,
        erro: (entrega.ultimoErro ?? motivo).slice(0, 500),
        agora: relogio.agora(),
        enviou: false,
      });
    });
  }
}
