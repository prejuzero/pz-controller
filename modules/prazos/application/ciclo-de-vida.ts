import { Conflito, err, hoje, LocalDate, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { Prazo, STATUS_DO_PRAZO } from '../domain/prazo.js';
import { RAMOS, UNIDADES } from '../domain/tabela.js';

import { prazoDetalhado, prazoListado, SugestaoDePrazo } from './prazos.js';

import type { FiltroDePrazos, FontesDaGeracao, RepositorioDePrazos } from './portas.js';
import type { CalcularPrazoParaProcesso, CriarPrazo, PrazoListado } from './prazos.js';
import type { Json } from '../domain/prazo.js';
import type { OrigemDaAuditoria, TipoDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Quem age no prazo (vem da sessão, nunca do corpo da requisição). */
export interface AutorNoPrazo {
  readonly usuarioId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
}

const Data = z.string().transform((texto, contexto) => {
  const data = LocalDate.analisar(texto);
  if (data.ok) return data.valor;
  contexto.addIssue({ code: 'custom', message: 'Data inválida (AAAA-MM-DD).' });
  return z.NEVER;
});
const Versao = z.number().int().positive();
const Motivo = z.string().trim().min(10, 'Explique o motivo (mínimo de 10 caracteres).').max(1000);

export const EntradaDeVersao = z.object({ versao: Versao }).strict();
export const EntradaDeCancelamento = z.object({ versao: Versao, motivo: Motivo }).strict();
export const EntradaDeAjuste = z
  .object({
    versao: Versao,
    motivo: Motivo,
    tipoAto: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Código de ato inválido.')
      .max(80)
      .optional(),
    ramo: z.enum(RAMOS).optional(),
    dias: z.number().int().positive().max(10_000).optional(),
    unidade: z.enum(UNIDADES).optional(),
    /** Data informada pelo advogado: fica "definida manualmente" (CLAUDE.md, seção 4.4). */
    vencimento: Data.optional(),
  })
  .strict()
  .refine(
    (a) =>
      a.vencimento !== undefined ||
      a.tipoAto !== undefined ||
      a.ramo !== undefined ||
      a.dias !== undefined,
    { message: 'Informe o que ajustar: ato, ramo, dias ou vencimento.' },
  );

const validacao = (erro: z.ZodError) =>
  new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));
const naoEncontrado = () => new NaoEncontrado('prazo-inexistente', 'Prazo não encontrado.');
const desatualizado = () =>
  new Conflito('versao-desatualizada', 'O prazo foi alterado por outra pessoa. Recarregue.');

type ErroDaAcao = Validacao | NaoEncontrado | Conflito;

/**
 * Executa uma ação do advogado no prazo (HU24): concorrência otimista pela versão lida (409 se
 * outra pessoa alterou), trilha com antes e depois e evento, na mesma transação (ADR-004, 006).
 */
async function alterarPrazo<Transacao>(
  deps: {
    readonly unidade: UnidadeDeTrabalho<Transacao>;
    readonly prazos: RepositorioDePrazos<Transacao>;
    readonly trilha: TrilhaDeAuditoria<Transacao>;
    readonly outbox: Outbox<Transacao>;
  },
  id: Uuid,
  versao: number,
  autor: AutorNoPrazo,
  tipo: TipoDeAuditoria,
  acao: (prazo: Prazo) => Promise<Result<void, ErroDaAcao>> | Result<void, ErroDaAcao>,
  simular = false,
): Promise<Result<PrazoListado, ErroDaAcao>> {
  const prazo = await deps.unidade.executar((tx) => deps.prazos.buscar(tx, id));
  if (prazo === undefined) return err(naoEncontrado());
  if (prazo.estado.versaoOtimista !== versao) return err(desatualizado());
  const antes = prazoListado(prazo.estado);
  // O cálculo (ajuste) lê tabela e calendário fora da transação de escrita.
  const r = await acao(prazo);
  if (!r.ok) return r;
  // Prévia (HU24): o mesmo cálculo, sem gravar nem emitir evento.
  if (simular) return ok(prazoListado(prazo.estado));
  return deps.unidade.executar(async (tx) => {
    if (!(await deps.prazos.atualizar(tx, prazo, versao))) return err(desatualizado());
    const depois = prazoListado(prazo.estado);
    await deps.trilha.registrar(
      tx,
      { tipo, entidade: 'prazo', entidadeId: id, antes, depois },
      { canal: autor.canal, usuarioId: autor.usuarioId },
    );
    await deps.outbox.gravar(tx, prazo.retirarEventos());
    return ok(depois);
  });
}

interface DependenciasDoCiclo<Transacao> {
  readonly unidade: UnidadeDeTrabalho<Transacao>;
  readonly prazos: RepositorioDePrazos<Transacao>;
  readonly trilha: TrilhaDeAuditoria<Transacao>;
  readonly outbox: Outbox<Transacao>;
  readonly relogio: Clock;
}

/** POST /v1/prazos/{id}/confirmar: "a confirmar" → pendente, pelo advogado. */
export class ConfirmarPrazo<Transacao> {
  constructor(private readonly deps: DependenciasDoCiclo<Transacao>) {}

  async executar(autor: AutorNoPrazo, id: Uuid, entrada: unknown) {
    const dados = EntradaDeVersao.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    return alterarPrazo(this.deps, id, dados.data.versao, autor, 'prazos.prazo-confirmado', (p) =>
      p.confirmar(autor.usuarioId, this.deps.relogio),
    );
  }
}

/** POST /v1/prazos/{id}/cumprir: pendente → cumprido. */
export class CumprirPrazo<Transacao> {
  constructor(private readonly deps: DependenciasDoCiclo<Transacao>) {}

  async executar(autor: AutorNoPrazo, id: Uuid, entrada: unknown) {
    const dados = EntradaDeVersao.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    return alterarPrazo(this.deps, id, dados.data.versao, autor, 'prazos.prazo-cumprido', (p) =>
      p.cumprir(autor.usuarioId, this.deps.relogio),
    );
  }
}

/** POST /v1/prazos/{id}/cancelar: com motivo, a partir de "a confirmar" ou pendente. */
export class CancelarPrazo<Transacao> {
  constructor(private readonly deps: DependenciasDoCiclo<Transacao>) {}

  async executar(autor: AutorNoPrazo, id: Uuid, entrada: unknown) {
    const dados = EntradaDeCancelamento.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    return alterarPrazo(this.deps, id, dados.data.versao, autor, 'prazos.prazo-cancelado', (p) =>
      p.cancelar(dados.data.motivo, autor.usuarioId, this.deps.relogio),
    );
  }
}

/**
 * POST /v1/prazos/{id}/ajustar (HU24): ato, ramo ou dias recalculam pelo motor a partir da
 * entrada guardada; vencimento informado fica "definido manualmente". Sempre com motivo.
 */
export class AjustarPrazo<Transacao> {
  constructor(
    private readonly deps: DependenciasDoCiclo<Transacao>,
    private readonly calcular: CalcularPrazoParaProcesso<Transacao>,
  ) {}

  /** Prévia do ajuste (POST .../simular-ajuste): o resultado do motor, sem gravar. */
  simular(autor: AutorNoPrazo, id: Uuid, entrada: unknown) {
    return this.executar(autor, id, entrada, true);
  }

  async executar(autor: AutorNoPrazo, id: Uuid, entrada: unknown, simular = false) {
    const dados = EntradaDeAjuste.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const a = dados.data;
    return alterarPrazo(
      this.deps,
      id,
      a.versao,
      autor,
      'prazos.prazo-ajustado',
      async (p) => {
        const e = p.estado;
        const tipoAto = a.tipoAto ?? e.tipoAto;
        if (a.vencimento !== undefined) {
          return p.ajustar(
            {
              tipoAto,
              ramo: a.ramo ?? e.ramo,
              vencimentoManual: true,
              entrada: e.entrada,
              parametros: e.parametros,
              calculo: {
                ...e.calculo,
                situacao: 'calculado',
                dias: a.dias ?? e.calculo.dias,
                unidade: a.unidade ?? e.calculo.unidade,
                inicio: null,
                vencimento: a.vencimento,
                // O fim às 24h no fuso do juízo é do motor; a data manual não o calcula.
                fimDoPrazo: null,
                memoria: {
                  situacao: 'definido-manualmente',
                  vencimento: a.vencimento.paraIso(),
                  motivo: a.motivo,
                },
              },
            },
            a.motivo,
            autor.usuarioId,
            this.deps.relogio,
          );
        }
        const base = e.parametros as Record<string, Json> | null;
        if (base === null || typeof base !== 'object' || base.meio === undefined) {
          return err(
            new Conflito(
              'prazo-sem-parametros',
              'Este prazo não guarda a entrada do cálculo: informe o vencimento.',
            ),
          );
        }
        const prazoNoTexto =
          a.dias === undefined ? base.prazoNoTexto : { dias: a.dias, unidade: a.unidade ?? 'dias' };
        const sugestao = await this.calcular.executar({
          ...base,
          processoId: e.processoId,
          tipoAto,
          ...(a.ramo === undefined ? {} : { ramo: a.ramo }),
          ...(prazoNoTexto === undefined ? {} : { prazoNoTexto }),
        });
        if (!sugestao.ok) return sugestao;
        const s = sugestao.valor;
        if (!SugestaoDePrazo.ehValida(s)) return err(desatualizado());
        return p.ajustar(
          {
            tipoAto,
            ramo: s.ramo,
            vencimentoManual: false,
            entrada: s.entrada ?? e.entrada,
            parametros: s.parametros,
            calculo: s.calculo,
          },
          a.motivo,
          autor.usuarioId,
          this.deps.relogio,
        );
      },
      simular,
    );
  }
}

const Consulta = z.object({
  status: z.enum(STATUS_DO_PRAZO).optional(),
  processoId: z.uuid().optional(),
  responsavelId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});
const Cursor = z.object({ v: z.iso.date().nullable(), id: z.uuid() });

/** GET /v1/prazos (HU24): por vencimento, mais próximo primeiro; sem data por último. */
export class ListarPrazos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly prazos: RepositorioDePrazos<Transacao>,
  ) {}

  async executar(
    consulta: unknown,
  ): Promise<Result<{ itens: PrazoListado[]; proximoCursor: string | null }, Validacao>> {
    const dados = Consulta.safeParse(consulta);
    if (!dados.success) return err(validacao(dados.error));
    const { cursor, limite, status, processoId, responsavelId } = dados.data;
    let depoisDe: FiltroDePrazos['depoisDe'];
    if (cursor !== undefined) {
      let lido: unknown;
      try {
        lido = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      } catch {
        // Cursor que não é JSON é entrada inválida do cliente: vira 400, não exceção.
        lido = undefined;
      }
      const c = Cursor.safeParse(lido);
      if (!c.success)
        return err(new Validacao([{ campo: 'cursor', mensagem: 'Cursor inválido.' }]));
      const v = c.data.v === null ? null : LocalDate.analisar(c.data.v);
      depoisDe = { vencimento: v === null ? null : v.ok ? v.valor : null, id: c.data.id as Uuid };
    }
    const linhas = await this.unidade.executar((tx) =>
      this.prazos.listar(tx, {
        limite: limite + 1,
        ...(status === undefined ? {} : { status }),
        ...(processoId === undefined ? {} : { processoId: processoId as Uuid }),
        ...(responsavelId === undefined ? {} : { responsavelId: responsavelId as Uuid }),
        ...(depoisDe === undefined ? {} : { depoisDe }),
      }),
    );
    const itens = linhas.slice(0, limite);
    const ultimo = itens.at(-1);
    return ok({
      itens: itens.map((p) => prazoListado(p.estado)),
      proximoCursor:
        linhas.length > limite && ultimo !== undefined
          ? Buffer.from(
              JSON.stringify({
                v: ultimo.estado.calculo.vencimento?.paraIso() ?? null,
                id: ultimo.id,
              }),
            ).toString('base64url')
          : null,
    });
  }
}

/** GET /v1/prazos/{id}: com a memória de cálculo e a entrada (CLAUDE.md, seção 4.4). */
export class ConsultarPrazo<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly prazos: RepositorioDePrazos<Transacao>,
  ) {}

  async executar(id: Uuid) {
    const prazo = await this.unidade.executar((tx) => this.prazos.buscar(tx, id));
    return prazo === undefined ? err(naoEncontrado()) : ok(prazoDetalhado(prazo.estado));
  }
}

/** Roda o trabalho no tenant informado (RLS), composto nas apps. */
export type NoTenant = <T>(tenantId: Uuid, trabalho: () => Promise<T>) => Promise<T>;

const LOTE_DE_VENCIDOS = 500;

/**
 * Job diário (HU24): marca vencidos os prazos abertos cujo vencimento ficou para trás, com trilha
 * e PrazoVencido. Conta "hoje" em Brasília: rodando de madrugada, o prazo de qualquer fuso do
 * país já terminou às 24h do vencimento no juízo (o mais a oeste, UTC-5, termina às 2h).
 */
export class MarcarPrazosVencidos<Transacao> {
  constructor(
    private readonly sistema: UnidadeDeTrabalho<Transacao>,
    private readonly noTenant: NoTenant,
    private readonly deps: DependenciasDoCiclo<Transacao>,
  ) {}

  async executar(): Promise<{ tenants: number; vencidos: number }> {
    const dia = hoje(this.deps.relogio);
    const tenants = await this.sistema.executar((tx) =>
      this.deps.prazos.tenantsComVencidos(tx, dia),
    );
    let vencidos = 0;
    for (const tenantId of tenants) {
      vencidos += await this.noTenant(tenantId, () => this.#doTenant(dia));
    }
    return { tenants: tenants.length, vencidos };
  }

  async #doTenant(dia: LocalDate): Promise<number> {
    let total = 0;
    for (;;) {
      const marcados = await this.deps.unidade.executar(async (tx) => {
        const lote = await this.deps.prazos.vencidos(tx, dia, LOTE_DE_VENCIDOS);
        for (const prazo of lote) {
          const antes = prazoListado(prazo.estado);
          const versao = prazo.estado.versaoOtimista;
          if (!prazo.vencer(dia, this.deps.relogio)) continue;
          // Alterado por outra pessoa no meio: fica para a próxima execução.
          if (!(await this.deps.prazos.atualizar(tx, prazo, versao))) continue;
          await this.deps.trilha.registrar(
            tx,
            {
              tipo: 'prazos.prazo-vencido',
              entidade: 'prazo',
              entidadeId: prazo.id,
              antes,
              depois: prazoListado(prazo.estado),
            },
            { canal: 'sistema' },
          );
          await this.deps.outbox.gravar(tx, prazo.retirarEventos());
        }
        return lote.length;
      });
      total += marcados;
      if (marcados < LOTE_DE_VENCIDOS) return total;
    }
  }
}

/** Ato que a classificação não reconheceu (mesmo código da taxonomia, HU21). */
const ATO_DESCONHECIDO = 'desconhecido';
/** Abaixo disso a classificação é incerta (CLAUDE.md, seção 11). */
const CONFIANCA_MINIMA = 0.85;

export type ResultadoDaGeracao =
  'criado' | 'ja-existe' | 'sem-classificacao' | 'sem-processo' | 'sem-prazo-aplicavel';

/**
 * Gera o prazo "a confirmar" de uma publicação recebida pelo tenant (HU24, PZ-168), uma vez por
 * publicação. Ato desconhecido ou classificação incerta também geram (com destaque): na dúvida,
 * o advogado vê. Só não gera quando o ato é conhecido, a classificação é segura e não há prazo
 * no texto nem na tabela (ex.: mero expediente); a publicação continua em Publicações.
 */
export class GerarPrazoDaPublicacao<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly prazos: RepositorioDePrazos<Transacao>,
    private readonly fontes: FontesDaGeracao,
    private readonly calcular: CalcularPrazoParaProcesso<Transacao>,
    private readonly criar: CriarPrazo<Transacao>,
  ) {}

  async executar(tenantId: Uuid, conteudoId: Uuid): Promise<ResultadoDaGeracao> {
    if (await this.unidade.executar((tx) => this.prazos.existeDaPublicacao(tx, conteudoId))) {
      return 'ja-existe';
    }
    const classificacao = await this.fontes.classificacao(conteudoId);
    // Ainda não classificada: o PublicacaoClassificada gera depois.
    if (classificacao === undefined) return 'sem-classificacao';
    const destinatario = await this.fontes.destinatario(conteudoId);
    if (destinatario === undefined) {
      throw new Error(`publicação ${conteudoId} sem destinatário no tenant ${tenantId}`);
    }
    if (destinatario.processoId === null) return 'sem-processo';
    const citado = classificacao.prazoCitado;
    const prazoNoTexto =
      citado === null || citado.divergente
        ? undefined
        : {
            dias: citado.quantidade,
            // "dias úteis" no texto: a contagem é a do ramo (RN01, RN07), feita pelo motor.
            unidade: citado.unidade === 'dias-uteis' ? ('dias' as const) : citado.unidade,
          };
    const incerta =
      classificacao.situacao !== 'ok' ||
      classificacao.tipoAto === null ||
      (classificacao.confianca !== null && classificacao.confianca < CONFIANCA_MINIMA);
    const sugestao = await this.calcular.executar({
      processoId: destinatario.processoId,
      tipoAto: classificacao.tipoAto ?? ATO_DESCONHECIDO,
      meio: 'djen',
      dataDeReferencia: destinatario.dataDisponibilizacao.paraIso(),
      ...(prazoNoTexto === undefined ? {} : { prazoNoTexto }),
    });
    if (!sugestao.ok) throw sugestao.erro;
    const semPrazo =
      !incerta &&
      prazoNoTexto === undefined &&
      sugestao.valor.resolucao !== null &&
      sugestao.valor.resolucao.aplicado === null;
    if (semPrazo) return 'sem-prazo-aplicavel';
    const responsavelId =
      destinatario.oabId === null
        ? null
        : ((await this.fontes.responsavelDaOab(destinatario.oabId)) ?? null);
    const r = await this.criar.executar(
      sugestao.valor,
      {
        origem: 'djen',
        responsavelId,
        publicacaoConteudoId: conteudoId,
        classificacaoIncerta: incerta,
      },
      { tenantId, canal: 'evento' },
    );
    if (!r.ok) throw r.erro;
    return 'criado';
  }
}

export const EntradaDoPrazoManual = z
  .object({
    processoId: z.uuid(),
    tipoAto: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Código de ato inválido.')
      .max(80),
    ramo: z.enum(RAMOS).optional(),
    dias: z.number().int().positive().max(10_000).optional(),
    unidade: z.enum(UNIDADES).default('dias'),
    /** Como o advogado soube do ato: DJEN, portal ou ciência informada por ele. */
    meio: z.enum(['djen', 'portal', 'manual']),
    dataDeReferencia: z.iso.date(),
    /** Onde o prazo foi visto (RF90): DJEN, cadastro manual ou painel do tribunal. */
    origem: z.enum(['djen', 'manual', 'painel']),
    observacao: z.string().trim().max(1000).optional(),
    /**
     * Vencimento que o advogado viu na prévia e confirma: o prazo já nasce pendente. Se o motor
     * der outra data, recusa (409) para ele rever.
     */
    vencimentoConfirmado: z.iso.date().optional(),
  })
  .strict();

/** Autor do cadastro manual, com o tenant da sessão. */
export interface AutorDoCadastro extends AutorNoPrazo {
  readonly tenantId: Uuid;
}

/**
 * Prazo cadastrado pelo advogado (HU25, PZ-172): a data é do motor, a partir do ato, dos dias
 * (prazo do texto) e da referência. Sem `vencimentoConfirmado`, nasce "a confirmar"; com ele igual
 * ao do motor, nasce pendente, confirmado pelo próprio autor no mesmo ato (CLAUDE.md, seção 2).
 */
export class CadastrarPrazoManual<Transacao> {
  constructor(
    private readonly calcular: CalcularPrazoParaProcesso<Transacao>,
    private readonly criar: CriarPrazo<Transacao>,
    private readonly relogio: Clock,
  ) {}

  /** Prévia: a mesma sugestão do motor, sem gravar. */
  async simular(autor: AutorDoCadastro, entrada: unknown) {
    const s = await this.#sugerir(entrada);
    if (!s.ok) return s;
    const prazo = Prazo.sugerir(
      {
        processoId: s.valor.sugestao.processoId,
        publicacaoConteudoId: null,
        tipoAto: s.valor.sugestao.tipoAto,
        ramo: s.valor.sugestao.ramo,
        calculo: s.valor.sugestao.calculo,
        entrada: s.valor.sugestao.entrada,
        origem: s.valor.dados.origem,
        responsavelId: autor.usuarioId,
        jurisdicao: s.valor.sugestao.jurisdicao,
        parametros: s.valor.sugestao.parametros,
        classificacaoIncerta: false,
      },
      autor.tenantId,
      this.relogio,
    );
    return ok(prazoListado(prazo.estado));
  }

  async executar(
    autor: AutorDoCadastro,
    entrada: unknown,
  ): Promise<Result<PrazoListado, Validacao | NaoEncontrado | Conflito>> {
    const s = await this.#sugerir(entrada);
    if (!s.ok) return s;
    const { sugestao, dados } = s.valor;
    const calculado = sugestao.calculo.vencimento?.paraIso() ?? null;
    if (dados.vencimentoConfirmado !== undefined && dados.vencimentoConfirmado !== calculado) {
      return err(
        new Conflito(
          'vencimento-divergente',
          'O vencimento calculado mudou desde a prévia. Confira de novo antes de confirmar.',
        ),
      );
    }
    return this.criar.executar(
      sugestao,
      {
        origem: dados.origem,
        responsavelId: autor.usuarioId,
        publicacaoConteudoId: null,
        ...(dados.vencimentoConfirmado === undefined ? {} : { confirmadoPor: autor.usuarioId }),
      },
      autor,
    );
  }

  async #sugerir(entrada: unknown) {
    const dados = EntradaDoPrazoManual.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const d = dados.data;
    const sugestao = await this.calcular.executar({
      processoId: d.processoId,
      tipoAto: d.tipoAto,
      ...(d.ramo === undefined ? {} : { ramo: d.ramo }),
      ...(d.dias === undefined ? {} : { prazoNoTexto: { dias: d.dias, unidade: d.unidade } }),
      meio: d.meio,
      dataDeReferencia: d.dataDeReferencia,
    });
    if (!sugestao.ok) return sugestao;
    const v = sugestao.valor;
    // A observação do advogado fica junto da entrada do cálculo (aparece no detalhe).
    const comObservacao =
      d.observacao === undefined || d.observacao === ''
        ? v
        : new SugestaoDePrazo(
            v.processoId,
            v.tipoAto,
            v.ramo,
            v.resolucao,
            v.calculo,
            v.entrada,
            v.jurisdicao,
            { ...(v.parametros as Record<string, Json>), observacao: d.observacao },
          );
    return ok({ sugestao: comObservacao, dados: d });
  }
}
