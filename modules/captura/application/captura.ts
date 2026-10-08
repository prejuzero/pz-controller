import { ErroIntegracao, Oab } from '@pz/integracoes';
import { gerarUuidV7, LocalDate } from '@pz/kernel';
import { z } from 'zod';

import {
  chaveDaCaptura,
  janelaDaCaptura,
  proximaTentativa,
  TIPOS_DE_ALVO,
  valorDaOab,
  valorDoProcesso,
} from '../domain/alvo.js';
import { alvoPrecisaDeAlerta, aposFalhaDaFonte, aposSucessoDaFonte } from '../domain/fonte.js';

import type {
  AlertasDaCaptura,
  AlvoParaEntrega,
  LeituraDoStatus,
  RepositorioDaCaptura,
  RepositorioDeAssinaturas,
  SituacaoPublicaDaFonte,
  StatusDaOab,
} from './portas.js';
import type { JanelaDaCaptura, TipoDeAlvo } from '../domain/alvo.js';
import type { FontePublicacoes, PublicacaoCapturada } from '@pz/integracoes';
import type { Clock, EventoDominio, Outbox, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Fuso do "hoje" da captura: o dia de disponibilização no DJEN é o de Brasília. */
const FUSO = 'America/Sao_Paulo';

const EventoDeOab = z.object({
  tenantId: z.uuid(),
  payload: z.object({ oabId: z.uuid(), numero: z.string(), uf: z.string() }),
});
const EventoDeProcesso = z.object({
  tenantId: z.uuid(),
  payload: z.object({ processoId: z.uuid(), numeroCnj: z.string() }),
});

/**
 * Mantém alvos e assinaturas a partir do cadastro (HU17): consumidores de OabAdicionada,
 * OabRemovida e ProcessoMonitorado, na transação do evento (entrega única por consumidor). A
 * mesma OAB em N escritórios vira um alvo com N assinantes. Payload inválido lança (vai à DLQ).
 */
export class ManterAssinaturas<Transacao> {
  constructor(
    private readonly assinaturas: RepositorioDeAssinaturas<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async oabAdicionada(transacao: Transacao, evento: unknown): Promise<void> {
    const { tenantId, payload } = EventoDeOab.parse(evento);
    await this.#assinar(
      transacao,
      'oab',
      valorDaOab(payload.numero, payload.uf),
      tenantId,
      payload.oabId,
    );
  }

  async oabRemovida(transacao: Transacao, evento: unknown): Promise<void> {
    const { tenantId, payload } = EventoDeOab.parse(evento);
    await this.assinaturas.desassinar(
      transacao,
      'oab',
      valorDaOab(payload.numero, payload.uf),
      tenantId as Uuid,
      payload.oabId as Uuid,
    );
  }

  async processoMonitorado(transacao: Transacao, evento: unknown): Promise<void> {
    const { tenantId, payload } = EventoDeProcesso.parse(evento);
    await this.#assinar(
      transacao,
      'processo',
      valorDoProcesso(payload.numeroCnj),
      tenantId,
      payload.processoId,
    );
  }

  async #assinar(
    transacao: Transacao,
    tipo: TipoDeAlvo,
    valor: string,
    tenantId: string,
    referencia: string,
  ): Promise<void> {
    const alvoId = await this.assinaturas.obterOuCriarAlvo(
      transacao,
      tipo,
      valor,
      gerarUuidV7(this.relogio),
    );
    await this.assinaturas.assinar(transacao, alvoId, tenantId as Uuid, referencia as Uuid);
  }
}

/** Uma execução a enfileirar: alvo, janela e chave de idempotência. */
export interface CapturaPlanejada {
  readonly alvoId: Uuid;
  readonly tipo: TipoDeAlvo;
  readonly valor: string;
  readonly inicio: string;
  readonly fim: string;
  readonly chave: string;
}

export interface OpcoesDaCaptura {
  /** Dias para trás na primeira captura de um alvo novo. */
  readonly diasIniciais: number;
}

/**
 * Planejamento (HU17): os alvos ativos com assinante e fora do recuo de falhas, cada um com a
 * janela desde a última captura. Quem enfileira (com jitter) é o job; aqui só a decisão.
 */
export class PlanejarCaptura<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly captura: RepositorioDaCaptura<Transacao>,
    private readonly relogio: Clock,
    private readonly opcoes: OpcoesDaCaptura,
  ) {}

  async executar(): Promise<CapturaPlanejada[]> {
    const agora = this.relogio.agora();
    const hoje = LocalDate.doInstante(agora, FUSO);
    const devidos = await this.unidade.executar((tx) => this.captura.devidos(tx, agora));
    return devidos.map((alvo) => {
      const janela = janelaDaCaptura(alvo.ultimaJanelaFim, hoje, this.opcoes.diasIniciais);
      return {
        alvoId: alvo.id,
        tipo: alvo.tipo,
        valor: alvo.valor,
        inicio: janela.inicio.paraIso(),
        fim: janela.fim.paraIso(),
        chave: chaveDaCaptura(alvo.id, janela),
      };
    });
  }
}

const Data = z.string().transform((texto, contexto) => {
  const data = LocalDate.analisar(texto);
  if (data.ok) return data.valor;
  contexto.addIssue({ code: 'custom', message: 'Data inválida (AAAA-MM-DD).' });
  return z.NEVER;
});
export const EntradaDaCaptura = z
  .object({
    alvoId: z.uuid(),
    tipo: z.enum(TIPOS_DE_ALVO),
    valor: z.string().min(1),
    inicio: Data,
    fim: Data,
  })
  // A `chave` do plano vem junto no job e é recalculada aqui: não precisa ser aceita.
  .strip();

export type ResultadoDaCaptura =
  | { readonly situacao: 'entregue'; readonly publicacoes: number; readonly tenants: number }
  | { readonly situacao: 'ja-entregue' | 'alvo-inexistente' };

/** "1000004062026826010" → "1000004-06.2026.8.26.0100" (formato da porta). */
function formatarCnj(digitos: string): string {
  return `${digitos.slice(0, 7)}-${digitos.slice(7, 9)}.${digitos.slice(9, 13)}.${digitos.slice(13, 14)}.${digitos.slice(14, 16)}.${digitos.slice(16)}`;
}

/** Falha que indica a fonte fora do ar (não cota nem resposta inválida de um alvo). */
const indicaDegradacao = (erro: unknown): boolean =>
  erro instanceof ErroIntegracao && erro.indicaDegradacao;

/**
 * Executa a captura de um alvo (HU17): uma consulta à fonte, qualquer que seja o número de
 * assinantes. A entrega roda numa transação do papel sistema (o alvo é global): trava o alvo,
 * grava um CapturaConcluida por tenant assinante e o checkpoint juntos. A mesma chave não entrega
 * duas vezes. Falha da fonte registra o recuo e relança: o job tenta de novo e vai à DLQ.
 *
 * Saúde da fonte (HU19): falhas seguidas que indicam indisponibilidade degradam a fonte (alerta
 * à equipe e FonteDegradada aos escritórios afetados); o primeiro sucesso a restabelece, antecipa
 * todos os alvos em recuo (recaptura desde o último sucesso) e emite FonteRestabelecida.
 */
export class ExecutarCaptura<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly captura: RepositorioDaCaptura<Transacao>,
    private readonly fonte: FontePublicacoes,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
    private readonly idDaFonte: string,
    private readonly alertas: AlertasDaCaptura,
  ) {}

  async executar(entrada: unknown): Promise<ResultadoDaCaptura> {
    const { alvoId, tipo, valor, inicio, fim } = EntradaDaCaptura.parse(entrada);
    const janela: JanelaDaCaptura = { inicio, fim };
    let publicacoes: PublicacaoCapturada[];
    try {
      publicacoes = await this.#buscar(tipo, valor, janela);
    } catch (erro) {
      await this.#registrarFalha(alvoId as Uuid, indicaDegradacao(erro));
      throw erro;
    }
    const chave = chaveDaCaptura(alvoId, janela);
    const { resultado, antecipados } = await this.unidade.executar(async (tx) => {
      const antecipados = await this.#registrarSucessoDaFonte(tx);
      const alvo = await this.captura.travar(tx, alvoId as Uuid);
      if (alvo === undefined)
        return { resultado: { situacao: 'alvo-inexistente' as const }, antecipados };
      if (alvo.ultimaChave === chave)
        return { resultado: { situacao: 'ja-entregue' as const }, antecipados };
      await this.outbox.gravar(tx, this.#eventos(alvo, janela, publicacoes));
      await this.captura.registrarSucesso(tx, alvo.id, this.relogio.agora(), janela, chave);
      const entregue: ResultadoDaCaptura = {
        situacao: 'entregue',
        publicacoes: publicacoes.length,
        tenants: alvo.assinantes.length,
      };
      return { resultado: entregue, antecipados };
    });
    // Depois do commit: o alerta só sai se a mudança foi gravada.
    if (antecipados !== undefined) this.alertas.fonteRestabelecida(this.idDaFonte, antecipados);
    return resultado;
  }

  /** Zera as falhas da fonte e, se ela estava degradada, restabelece e antecipa os alvos. */
  async #registrarSucessoDaFonte(tx: Transacao): Promise<number | undefined> {
    // Leitura sem trava primeiro: no caso comum (fonte saudável) nenhuma captura espera outra.
    const lido = await this.captura.estadoDaFonte(tx, this.idDaFonte);
    if (lido.situacao === 'operacional' && lido.falhasConsecutivas === 0) return undefined;
    const atual = await this.captura.travarFonte(tx, this.idDaFonte);
    const { estado, transicao } = aposSucessoDaFonte(atual);
    const agora = this.relogio.agora();
    if (transicao !== 'restabeleceu') {
      await this.captura.gravarFonte(tx, this.idDaFonte, estado);
      return undefined;
    }
    await this.captura.gravarFonte(tx, this.idDaFonte, estado, agora);
    const antecipados = await this.captura.anteciparAlvos(tx, agora);
    await this.outbox.gravar(tx, await this.#avisos(tx, 'FonteRestabelecida', { antecipados }));
    return antecipados;
  }

  /** Um evento por escritório afetado: quem assina algum alvo depende da fonte. */
  async #avisos(tx: Transacao, tipo: string, extra: object): Promise<EventoDominio[]> {
    const ocorridoEm = this.relogio.agora();
    const tenants = await this.captura.tenantsAssinantes(tx);
    return tenants.map((tenantId) => ({
      id: gerarUuidV7(this.relogio),
      tipo,
      versao: 1,
      tenantId,
      agregadoId: tenantId,
      ocorridoEm,
      payload: { fonte: this.idDaFonte, ...extra },
    }));
  }

  #buscar(tipo: TipoDeAlvo, valor: string, janela: JanelaDaCaptura) {
    if (tipo === 'processo') return this.fonte.buscarPorProcesso(formatarCnj(valor), janela);
    const [numero = '', uf = ''] = valor.split('/');
    return this.fonte.buscarPorOab(Oab.parse({ numero, uf }), janela);
  }

  async #registrarFalha(alvoId: Uuid, daFonte: boolean): Promise<void> {
    const agora = this.relogio.agora();
    const { falhasDoAlvo, fonte } = await this.unidade.executar(async (tx) => {
      const fonte = daFonte ? await this.#registrarFalhaDaFonte(tx) : undefined;
      const alvo = await this.captura.travar(tx, alvoId);
      if (alvo === undefined) return { falhasDoAlvo: 0, fonte };
      const falhas = alvo.falhasConsecutivas + 1;
      await this.captura.registrarFalha(tx, alvoId, falhas, proximaTentativa(agora, falhas));
      return { falhasDoAlvo: falhas, fonte };
    });
    if (fonte !== undefined) this.alertas.fonteDegradada(this.idDaFonte, fonte);
    if (alvoPrecisaDeAlerta(falhasDoAlvo)) this.alertas.alvoFalhando(alvoId, falhasDoAlvo);
  }

  /** Conta a falha da fonte; devolve as falhas quando ela acabou de degradar. */
  async #registrarFalhaDaFonte(tx: Transacao): Promise<number | undefined> {
    const { estado, transicao } = aposFalhaDaFonte(
      await this.captura.travarFonte(tx, this.idDaFonte),
    );
    if (transicao !== 'degradou') {
      await this.captura.gravarFonte(tx, this.idDaFonte, estado);
      return undefined;
    }
    await this.captura.gravarFonte(tx, this.idDaFonte, estado, this.relogio.agora());
    await this.outbox.gravar(tx, await this.#avisos(tx, 'FonteDegradada', {}));
    return estado.falhasConsecutivas;
  }

  #eventos(
    alvo: AlvoParaEntrega,
    janela: JanelaDaCaptura,
    publicacoes: readonly PublicacaoCapturada[],
  ): EventoDominio[] {
    const ocorridoEm = this.relogio.agora();
    const serializadas = publicacoes.map((p) => ({
      idExterno: p.idExterno,
      hashConteudo: p.hashConteudo,
      dataDisponibilizacao: p.dataDisponibilizacao.paraIso(),
      teor: p.teor,
      ...(p.numeroCnj === undefined ? {} : { numeroCnj: p.numeroCnj }),
      destinatarios: p.destinatarios.map(({ oab }) => ({ numero: oab.numero, uf: oab.uf })),
      urlFonte: p.urlFonte,
      metadados: p.metadados,
    }));
    return alvo.assinantes.map(({ tenantId, referencias }) => ({
      id: gerarUuidV7(this.relogio),
      tipo: 'CapturaConcluida',
      versao: 1,
      tenantId,
      agregadoId: alvo.id,
      ocorridoEm,
      payload: {
        alvoId: alvo.id,
        tipo: alvo.tipo,
        valor: alvo.valor,
        referencias: [...referencias],
        janela: { inicio: janela.inicio.paraIso(), fim: janela.fim.paraIso() },
        fonte: this.idDaFonte,
        publicacoes: serializadas,
      },
    }));
  }
}

export interface StatusDaCaptura {
  readonly fonte: SituacaoPublicaDaFonte;
  readonly oabs: readonly StatusDaOab[];
}

/** Status da captura do escritório (HU19): por OAB e a situação da fonte. Só leitura. */
export class ConsultarStatusDaCaptura<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly leitura: LeituraDoStatus<Transacao>,
    private readonly idDaFonte: string,
  ) {}

  executar(): Promise<StatusDaCaptura> {
    return this.unidade.executar(async (tx) => ({
      fonte: await this.leitura.fonte(tx, this.idDaFonte),
      oabs: await this.leitura.oabs(tx),
    }));
  }
}
