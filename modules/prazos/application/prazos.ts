import { err, LocalDate, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import {
  calcularPrazo,
  calendarioDeOcorrencias,
  contagemDoRamo,
  ENTES,
  LIMITE_DE_DIAS,
  MEIOS,
  POLITICAS_DE_DOBRO,
  serializarResultado,
  VERSAO_DO_MOTOR,
} from '@pz/motor-prazos';
import { z } from 'zod';

import { Prazo } from '../domain/prazo.js';
import { CONTAGENS, RAMOS, UNIDADES } from '../domain/tabela.js';

import type {
  AlcanceDaAlteracao,
  DiaDoCalendario,
  LocalizadorDoProcesso,
  ProcessoNoCalendario,
  RepositorioDePrazos,
  TipoDeDia,
} from './portas.js';
import type { ResolverPrazoAplicavel } from './tabela-de-prazos.js';
import type {
  CalculoDoPrazo,
  EstadoDoPrazo,
  JurisdicaoDoPrazo,
  Json,
  OrigemDoPrazo,
} from '../domain/prazo.js';
import type { PrazoResolvido } from '../domain/resolucao.js';
import type { Ramo } from '../domain/tabela.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';
import type { Efeito, EntradaDoCalculo, ResultadoDoCalculo } from '@pz/motor-prazos';

const Data = z.string().transform((texto, contexto) => {
  const data = LocalDate.analisar(texto);
  if (data.ok) return data.valor;
  contexto.addIssue({ code: 'custom', message: 'Data inválida (AAAA-MM-DD).' });
  return z.NEVER;
});

const Condicoes = z
  .object({
    ente: z.enum(ENTES).optional(),
    litisconsortesComProcuradoresDistintos: z.boolean().optional(),
    autosFisicos: z.boolean().optional(),
    excecaoDaSuspensaoPenal: z.boolean().optional(),
  })
  .strict();

export const EntradaDoCalculoDoProcesso = z
  .object({
    processoId: z.uuid(),
    tipoAto: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Código de ato inválido.')
      .max(80),
    /** Ramo do rito; ausente, só a Justiça do Trabalho é dedutível do processo. */
    ramo: z.enum(RAMOS).optional(),
    prazoNoTexto: z
      .object({ dias: z.number().int().positive().max(10_000), unidade: z.enum(UNIDADES) })
      .strict()
      .optional(),
    meio: z.enum(MEIOS),
    /** DJEN: disponibilização. Portal: envio. Manual: ciência informada pelo advogado. */
    dataDeReferencia: Data,
    dataDaConsulta: Data.optional(),
    condicoes: Condicoes.default({}),
  })
  .strict();

/**
 * Efeito de cada tipo de dia do calendário no motor (ADR-007: o calendário chega por interface).
 * Correspondência da carga da curadoria V2 (docs/curadoria/carga/README.md): "suspensão de
 * prazos" foi cadastrada como `portaria`; "expediente reduzido", como `indisponibilidade`.
 */
const EFEITO_DO_DIA: Readonly<Record<TipoDeDia, Efeito>> = {
  // Feriado, recesso: dia sem expediente forense (CPC, art. 216).
  feriado: 'sem-expediente',
  recesso: 'sem-expediente',
  portaria: 'suspensao-de-prazos',
  // Só prorroga início e vencimento (CPC, art. 224, §1º; Lei 11.419/2006, art. 10, §2º).
  indisponibilidade: 'indisponibilidade',
};

/** Primeira janela de calendário lida; dobra até cobrir a data mais tardia do cálculo. */
const JANELA_INICIAL_DIAS = 120;

const avisoDeOutrosFusos = (fuso: string) =>
  `O tribunal tem unidades em mais de um fuso: o prazo foi calculado no de fim mais cedo (${fuso}). Confira o fuso da unidade onde o ato será praticado.`;

/** Entrada do motor sem o calendário: gravada no prazo para o recálculo (ADR-007). */
const EntradaGravada = z.object({
  ramo: z.enum(RAMOS),
  meio: z.enum(MEIOS),
  dataDeReferencia: Data,
  dataDaConsulta: Data.optional(),
  condicoes: Condicoes,
  prazo: z.object({
    quantidade: z.number().int().positive(),
    unidade: z.enum(UNIDADES),
    contagem: z.enum(CONTAGENS),
    fundamento: z.string().min(1),
    versao: z.string().min(1),
    dobro: z.enum(POLITICAS_DE_DOBRO),
    alerta: z.string().optional(),
  }),
  versaoTabela: z.number().int().positive().nullable(),
});
type EntradaGravada = z.infer<typeof EntradaGravada>;

function validacao(erro: z.ZodError): Validacao {
  return new Validacao(
    erro.issues.map((problema) => ({ campo: problema.path.join('.'), mensagem: problema.message })),
  );
}

/** Remove chaves `undefined` (exactOptionalPropertyTypes): ausente é diferente de vazio. */
function semIndefinidos<T extends object>(objeto: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

/** Só a Justiça do Trabalho tem um rito só (CLT, art. 775); nos demais, o ramo é informado. */
function ramoDoCalculo(informado: Ramo | undefined, ramoDoTribunal: string | null): Ramo | null {
  if (informado !== undefined) return informado;
  return ramoDoTribunal === 'trabalho' ? 'trabalhista' : null;
}

function aConfirmar(
  motivo: string,
  detalhe: string,
  fundamentos: readonly string[],
  extra: { dias?: number; unidade?: CalculoDoPrazo['unidade']; versaoTabela?: number | null } = {},
): CalculoDoPrazo {
  return {
    situacao: 'a-confirmar',
    dias: extra.dias ?? null,
    unidade: extra.unidade ?? null,
    inicio: null,
    vencimento: null,
    fimDoPrazo: null,
    fusoDoJuizo: null,
    fundamento: fundamentos[0] ?? null,
    versaoMotor: VERSAO_DO_MOTOR,
    versaoTabela: extra.versaoTabela ?? null,
    memoria: { situacao: 'a-confirmar', motivo, detalhe, fundamentos: [...fundamentos] },
  };
}

/** Data mais tardia que o cálculo usou: o calendário lido precisa ir até ela. */
function ultimaData(resultado: ResultadoDoCalculo): LocalDate | undefined {
  if (resultado.situacao !== 'calculado') return undefined;
  return resultado.alternativas.reduce(
    (maior, alternativa) =>
      alternativa.vencimento.ehDepoisDe(maior) ? alternativa.vencimento : maior,
    resultado.vencimento,
  );
}

/**
 * Roda o motor com o calendário do processo. O motor é síncrono e não lê banco: lê-se uma janela
 * do calendário e, se o cálculo passar do fim dela, a janela dobra e o cálculo se repete, até
 * cobrir a data mais tardia (vencimento e alternativas). Nenhuma data é calculada aqui.
 */
async function calcularComCalendario(
  entrada: EntradaGravada,
  processo: ProcessoNoCalendario,
): Promise<CalculoDoPrazo> {
  const referencia = entrada.dataDeReferencia;
  let janela = JANELA_INICIAL_DIAS;
  for (;;) {
    const fim = referencia.maisDias(janela);
    const dias = await processo.diasNaoUteis(referencia, fim);
    const motorEntrada: EntradaDoCalculo = {
      ramo: entrada.ramo,
      meio: entrada.meio,
      dataDeReferencia: referencia,
      ...(entrada.dataDaConsulta === undefined ? {} : { dataDaConsulta: entrada.dataDaConsulta }),
      prazo: semIndefinidos(entrada.prazo),
      condicoes: semIndefinidos(entrada.condicoes),
      fusoDoJuizo: processo.fuso.fuso,
      calendario: calendarioDeOcorrencias(
        dias.map((dia: DiaDoCalendario) => ({
          data: dia.data,
          efeito: EFEITO_DO_DIA[dia.tipo],
          motivo: dia.motivo,
          atoNormativo: dia.atoNormativo,
          urlAto: dia.urlAto,
        })),
        // Feriados municipais sem nível no processo (lacunas): o motor avisa (curadoria V2, aba 8).
        { feriadosLocaisVerificados: processo.lacunas.length === 0 },
      ),
    };
    const resultado = calcularPrazo(motorEntrada);
    const ultima = ultimaData(resultado);
    if (ultima !== undefined && ultima.ehDepoisDe(fim) && janela < LIMITE_DE_DIAS) {
      janela *= 2;
      continue;
    }
    return paraCalculo(resultado, entrada, processo);
  }
}

function paraCalculo(
  resultado: ResultadoDoCalculo,
  entrada: EntradaGravada,
  processo: ProcessoNoCalendario,
): CalculoDoPrazo {
  const comAvisos: ResultadoDoCalculo =
    resultado.situacao === 'calculado' && processo.fuso.outrosFusos
      ? { ...resultado, avisos: [...resultado.avisos, avisoDeOutrosFusos(processo.fuso.fuso)] }
      : resultado;
  const memoria = JSON.parse(serializarResultado(comAvisos)) as Json;
  if (comAvisos.situacao === 'a-confirmar') {
    return {
      ...aConfirmar(comAvisos.motivo, comAvisos.detalhe, comAvisos.fundamentos, {
        dias: entrada.prazo.quantidade,
        unidade: entrada.prazo.unidade,
        versaoTabela: entrada.versaoTabela,
      }),
      memoria,
    };
  }
  return {
    situacao: 'calculado',
    dias: entrada.prazo.quantidade,
    unidade: entrada.prazo.unidade,
    inicio: comAvisos.inicio,
    vencimento: comAvisos.vencimento,
    fimDoPrazo: comAvisos.fimDoPrazo,
    fusoDoJuizo: comAvisos.fusoDoJuizo,
    fundamento: entrada.prazo.fundamento,
    versaoMotor: comAvisos.versaoDoMotor,
    versaoTabela: entrada.versaoTabela,
    memoria,
  };
}

function gravavel(entrada: EntradaGravada): Json {
  return JSON.parse(JSON.stringify(semIndefinidos(entrada))) as Json;
}

/**
 * Sugestão de prazo: só `CalcularPrazoParaProcesso` cria uma, para que `CriarPrazo` grave apenas
 * o que saiu do motor (nenhuma data vinda de fora, ADR-007).
 */
export class SugestaoDePrazo {
  /** @internal Use `CalcularPrazoParaProcesso`. */
  constructor(
    readonly processoId: Uuid,
    readonly tipoAto: string,
    readonly ramo: Ramo | null,
    /** Prazo do texto e da tabela, os dois para exibição (CLAUDE.md, seção 4.4). */
    readonly resolucao: PrazoResolvido | null,
    readonly calculo: CalculoDoPrazo,
    readonly entrada: Json,
    readonly jurisdicao: JurisdicaoDoPrazo,
    readonly parametros: Json,
  ) {}

  static ehValida(valor: unknown): valor is SugestaoDePrazo {
    return valor instanceof SugestaoDePrazo;
  }
}

/**
 * Sugestão de prazo para um ato do processo (HU16, RF11/RF12): jurisdição e fuso do processo,
 * prazo da tabela aprovada (ou do texto) e calendário, com a data só pelo motor (ADR-007).
 */
export class CalcularPrazoParaProcesso<Transacao> {
  constructor(
    private readonly localizar: LocalizadorDoProcesso,
    private readonly resolver: ResolverPrazoAplicavel<Transacao>,
  ) {}

  async executar(entrada: unknown): Promise<Result<SugestaoDePrazo, Validacao | NaoEncontrado>> {
    const dados = EntradaDoCalculoDoProcesso.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const { processoId, tipoAto, prazoNoTexto, dataDeReferencia } = dados.data;
    const processo = await this.localizar(processoId as Uuid);
    if (processo === undefined) {
      return err(new NaoEncontrado('processo-inexistente', 'Processo não encontrado.'));
    }
    const jurisdicao: JurisdicaoDoPrazo = { ...processo.jurisdicao, lacunas: processo.lacunas };
    const ramo = ramoDoCalculo(dados.data.ramo, processo.ramoDoTribunal);
    const sugestao = (resolucao: PrazoResolvido | null, calculo: CalculoDoPrazo, gravada: Json) =>
      ok(
        new SugestaoDePrazo(
          processoId as Uuid,
          tipoAto,
          ramo,
          resolucao,
          calculo,
          gravada,
          jurisdicao,
          // A entrada pedida (sem o processo): o ajuste recalcula a partir dela.
          JSON.parse(
            JSON.stringify({ ...semIndefinidos(dados.data), processoId: undefined }),
          ) as Json,
        ),
      );

    if (ramo === null) {
      // Sem o rito não há regra de contagem nem linha da tabela (CLAUDE.md, seção 4.4).
      return sugestao(
        null,
        aConfirmar('dados-insuficientes', 'ramo do processo não informado', []),
        null,
      );
    }
    // A tabela vale pela vigência na data do ato (CPC, art. 14): a da disponibilização ou ciência.
    const resolvido = await this.resolver.executar({
      tipoAto,
      ramo,
      dataDoAto: dataDeReferencia.paraIso(),
      ...(prazoNoTexto === undefined ? {} : { prazoNoTexto }),
    });
    if (!resolvido.ok) return err(resolvido.erro);
    const resolucao = resolvido.valor;
    const { aplicado, tabela } = resolucao;
    if (aplicado === null) {
      return sugestao(
        resolucao,
        aConfirmar('sem-regra-legal', 'sem regra legal cadastrada para este ato', []),
        null,
      );
    }
    if (tabela !== null && tabela.calculo !== 'automatico') {
      // Curadoria V2, aba 9: o marco não é a publicação, ou o ato não tem cálculo automático.
      const detalhe =
        tabela.calculo === 'data-informada'
          ? `a tabela pede a data informada pelo advogado${tabela.marcoInicial === null ? '' : ` (marco: ${tabela.marcoInicial})`}`
          : 'a tabela não prevê cálculo automático para este ato';
      return sugestao(
        resolucao,
        aConfirmar('dados-insuficientes', detalhe, [tabela.fundamento], {
          dias: aplicado.dias,
          unidade: aplicado.unidade,
          versaoTabela: tabela.versao,
        }),
        null,
      );
    }
    const gravada: EntradaGravada = {
      ramo,
      meio: dados.data.meio,
      dataDeReferencia,
      ...(dados.data.dataDaConsulta === undefined
        ? {}
        : { dataDaConsulta: dados.data.dataDaConsulta }),
      condicoes: semIndefinidos(dados.data.condicoes),
      prazo: {
        quantidade: aplicado.dias,
        unidade: aplicado.unidade,
        // Prazo só do texto, sem linha da tabela: a contagem é a do ramo (RN01, RN07).
        contagem: tabela?.contagem ?? contagemDoRamo(ramo),
        fundamento: resolucao.fundamento ?? '',
        versao:
          tabela === null
            ? 'sem-tabela'
            : `${tabela.tipoAto}/${tabela.ramo}/v${String(tabela.versao)}`,
        // Sem linha na tabela, o dobro não é automático: o motor mostra as duas datas (RN06).
        dobro: tabela?.politicaDobro ?? 'verificar',
        ...(tabela?.alerta === null || tabela?.alerta === undefined
          ? {}
          : { alerta: tabela.alerta }),
      },
      versaoTabela: tabela?.versao ?? null,
    };
    return sugestao(resolucao, await calcularComCalendario(gravada, processo), gravavel(gravada));
  }
}

/** Quem cria o prazo, e por qual canal (vai para a trilha). */
export interface AutorDoPrazo {
  readonly tenantId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
  readonly usuarioId?: Uuid;
}

export interface DadosDoNovoPrazo {
  readonly origem: OrigemDoPrazo;
  readonly responsavelId: Uuid | null;
  readonly publicacaoConteudoId: Uuid | null;
  /** Classificação de confiança baixa ou de revisão manual (HU24). */
  readonly classificacaoIncerta?: boolean;
}

/** Representação serializável (auditoria e respostas). */
export function prazoListado(estado: EstadoDoPrazo) {
  const c = estado.calculo;
  return {
    id: estado.id,
    processoId: estado.processoId,
    publicacaoConteudoId: estado.publicacaoConteudoId,
    tipoAto: estado.tipoAto,
    ramo: estado.ramo,
    situacao: c.situacao,
    dias: c.dias,
    unidade: c.unidade,
    inicio: c.inicio?.paraIso() ?? null,
    vencimento: c.vencimento?.paraIso() ?? null,
    fimDoPrazo: c.fimDoPrazo?.paraIso() ?? null,
    fusoDoJuizo: c.fusoDoJuizo,
    fundamento: c.fundamento,
    versaoMotor: c.versaoMotor,
    versaoTabela: c.versaoTabela,
    vencimentoManual: estado.vencimentoManual,
    origem: estado.origem,
    status: estado.status,
    statusCiencia: estado.statusCiencia,
    responsavelId: estado.responsavelId,
    jurisdicao: estado.jurisdicao,
    classificacaoIncerta: estado.classificacaoIncerta,
    motivoAjuste: estado.motivoAjuste,
    versao: estado.versaoOtimista,
  };
}

/** Detalhe (HU24): o listado mais a memória de cálculo e a entrada pedida. */
export function prazoDetalhado(estado: EstadoDoPrazo) {
  return {
    ...prazoListado(estado),
    memoria: estado.calculo.memoria,
    parametros: estado.parametros,
  };
}
export type PrazoListado = ReturnType<typeof prazoListado>;

/**
 * Grava a sugestão como prazo "a confirmar" (HU16), com auditoria e PrazoSugerido na mesma
 * transação (ADR-004, ADR-006). Só aceita sugestão vinda de `CalcularPrazoParaProcesso`.
 */
export class CriarPrazo<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly prazos: RepositorioDePrazos<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    sugestao: SugestaoDePrazo,
    dados: DadosDoNovoPrazo,
    autor: AutorDoPrazo,
  ): Promise<Result<PrazoListado, Validacao>> {
    if (!SugestaoDePrazo.ehValida(sugestao)) {
      return err(new Validacao([{ campo: 'sugestao', mensagem: 'Sugestão não veio do motor.' }]));
    }
    const prazo = Prazo.sugerir(
      {
        processoId: sugestao.processoId,
        publicacaoConteudoId: dados.publicacaoConteudoId,
        tipoAto: sugestao.tipoAto,
        ramo: sugestao.ramo,
        calculo: sugestao.calculo,
        entrada: sugestao.entrada,
        origem: dados.origem,
        responsavelId: dados.responsavelId,
        jurisdicao: sugestao.jurisdicao,
        parametros: sugestao.parametros,
        classificacaoIncerta: dados.classificacaoIncerta ?? false,
      },
      autor.tenantId,
      this.relogio,
    );
    return this.unidade.executar(async (transacao) => {
      await this.prazos.inserir(transacao, prazo);
      const depois = prazoListado(prazo.estado);
      await this.trilha.registrar(
        transacao,
        { tipo: 'prazos.prazo-sugerido', entidade: 'prazo', entidadeId: prazo.id, depois },
        semIndefinidos({ canal: autor.canal, usuarioId: autor.usuarioId }),
      );
      await this.outbox.gravar(transacao, prazo.retirarEventos());
      return ok(depois);
    });
  }
}

const AlteracaoRecebida = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  payload: z.object({
    eventoId: z.uuid(),
    origem: z.enum(['global', 'local']),
    abrangencia: z.enum(['nacional', 'uf', 'municipio', 'tribunal', 'comarca']),
    uf: z.string().optional(),
    tribunal: z.string().optional(),
    comarca: z.string().optional(),
    inicio: Data,
    fim: Data,
  }),
});

/** O que o recálculo precisa do CalendarioAlterado, já validado (entrada externa: fila). */
export interface AlteracaoDoCalendario {
  readonly eventoCalendarioId: Uuid;
  readonly origem: 'global' | 'local';
  /** Tenant do evento: o do escritório no feriado local; o da plataforma no global. */
  readonly tenantId: Uuid;
  readonly alcance: AlcanceDaAlteracao;
}

export function lerAlteracaoDoCalendario(evento: unknown): AlteracaoDoCalendario {
  const { tenantId, payload } = AlteracaoRecebida.parse(evento);
  return {
    eventoCalendarioId: payload.eventoId as Uuid,
    origem: payload.origem,
    tenantId: tenantId as Uuid,
    alcance: semIndefinidos({
      abrangencia: payload.abrangencia,
      uf: payload.uf,
      tribunal: payload.tribunal,
      comarca: payload.comarca,
      inicio: payload.inicio,
      fim: payload.fim,
    }),
  };
}

/** Lote do recálculo (card PZ-142): pequeno o bastante para uma transação curta. */
export const LOTE_DO_RECALCULO = 500;

export interface ResultadoDoLote {
  readonly lidos: number;
  readonly alterados: number;
  readonly vencimentosAlterados: number;
  /** Último id lido; `null` quando não há mais lotes. */
  readonly proximo: Uuid | null;
}

/**
 * Recalcula os prazos abertos que um CalendarioAlterado alcança (HU16, PZ-142), um lote por vez,
 * no tenant corrente. Idempotente: o mesmo evento de novo não muda nada, porque o cálculo com o
 * mesmo calendário dá o mesmo resultado. Mudança de vencimento grava antes e depois na trilha e
 * emite PrazoRecalculado, na mesma transação (ADR-004, ADR-006). Falha lança, para o job tentar
 * de novo e ir à DLQ (nada falha em silêncio).
 */
export class RecalcularPrazosPorCalendario<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly prazos: RepositorioDePrazos<Transacao>,
    private readonly localizar: LocalizadorDoProcesso,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
    private readonly lote = LOTE_DO_RECALCULO,
  ) {}

  async executarLote(
    alteracao: AlteracaoDoCalendario,
    depoisDe: Uuid | null,
  ): Promise<ResultadoDoLote> {
    // Município não chega ao prazo: o processo não guarda o município (lacuna da jurisdição).
    if (alteracao.alcance.abrangencia === 'municipio') {
      return { lidos: 0, alterados: 0, vencimentosAlterados: 0, proximo: null };
    }
    const lidos = await this.unidade.executar((transacao) =>
      this.prazos.afetados(transacao, alteracao.alcance, depoisDe, this.lote),
    );
    // O calendário é lido fora da transação de escrita: ela fica curta.
    const novos = new Map<Uuid, CalculoDoPrazo>();
    for (const prazo of lidos) {
      if (!prazo.recalculavel) continue;
      const entrada = EntradaGravada.parse(prazo.estado.entrada);
      const processo = await this.localizar(prazo.estado.processoId);
      if (processo === undefined) {
        throw new Error(`processo ${prazo.estado.processoId} do prazo ${prazo.id} não encontrado`);
      }
      novos.set(prazo.id, await calcularComCalendario(entrada, processo));
    }
    let alterados = 0;
    let vencimentosAlterados = 0;
    await this.unidade.executar(async (transacao) => {
      for (const prazo of lidos) {
        const calculo = novos.get(prazo.id);
        if (calculo === undefined) continue;
        const antes = prazoListado(prazo.estado);
        const versaoLida = prazo.estado.versaoOtimista;
        const efeito = prazo.recalcular(calculo, alteracao.eventoCalendarioId, this.relogio);
        if (efeito === 'sem-mudanca') continue;
        if (!(await this.prazos.atualizar(transacao, prazo, versaoLida))) {
          // Alterado por outra pessoa no meio: o job tenta de novo e relê o prazo.
          throw new Error(`prazo ${prazo.id} alterado durante o recálculo`);
        }
        await this.trilha.registrar(
          transacao,
          {
            tipo: 'prazos.prazo-recalculado',
            entidade: 'prazo',
            entidadeId: prazo.id,
            antes,
            depois: {
              ...prazoListado(prazo.estado),
              motivo: 'calendario-alterado',
              eventoCalendarioId: alteracao.eventoCalendarioId,
            },
          },
          { canal: 'evento' },
        );
        await this.outbox.gravar(transacao, prazo.retirarEventos());
        alterados++;
        if (efeito === 'vencimento') vencimentosAlterados++;
      }
    });
    const ultimo = lidos.at(-1);
    return {
      lidos: lidos.length,
      alterados,
      vencimentosAlterados,
      proximo: lidos.length < this.lote || ultimo === undefined ? null : ultimo.id,
    };
  }
}

/**
 * Tenants alcançados por uma mudança do calendário global (HU16). Roda como sistema (sem RLS),
 * só para listar: o recálculo de cada tenant roda depois no próprio tenant.
 */
export class TenantsAfetadosPeloCalendario<Transacao> {
  constructor(
    private readonly sistema: UnidadeDeTrabalho<Transacao>,
    private readonly prazos: RepositorioDePrazos<Transacao>,
  ) {}

  async executar(alteracao: AlteracaoDoCalendario): Promise<Uuid[]> {
    // Município não chega ao prazo: o processo não guarda o município (lacuna da jurisdição).
    if (alteracao.alcance.abrangencia === 'municipio') return [];
    if (alteracao.origem === 'local') return [alteracao.tenantId];
    return this.sistema.executar((transacao) =>
      this.prazos.tenantsAfetados(transacao, alteracao.alcance),
    );
  }
}
