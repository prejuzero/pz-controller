import { minimizarDadosPessoais } from '@pz/ia';
import { Conflito, err, gerarUuidV7, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import type { LeitorDeTeor } from './classificar-publicacao.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Instant, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

export const STATUS_DO_CANDIDATO = ['pendente', 'aceito', 'descartado'] as const;
export type StatusDoCandidato = (typeof STATUS_DO_CANDIDATO)[number];

/**
 * Caso candidato ao conjunto de avaliação (HU22, PZ-162): a classificação e a correção do
 * advogado. Sem tenant e com dados pessoais minimizados; o curador confere antes de aceitar.
 */
export interface CasoCandidato {
  readonly id: Uuid;
  readonly conteudoId: Uuid;
  readonly teorAnonimizado: string;
  readonly tipoAtoClassificado: string | null;
  readonly tipoAtoCorrigido: string;
  readonly diasCitados: number | null;
  readonly diasCorrigidos: number | null;
  readonly status: StatusDoCandidato;
  readonly motivoDecisao: string | null;
  readonly decididoPor: Uuid | null;
  readonly decididoEm: Instant | null;
}

/** Classificação gravada do conteúdo (a mesma tabela global da HU21). */
export interface ClassificacaoOriginal {
  readonly tipoAto: string | null;
  readonly diasCitados: number | null;
}

/** Porta: casos candidatos (tabela global `caso_candidato_curadoria`). */
export interface RepositorioDeCandidatos<Transacao> {
  classificacao(transacao: Transacao, conteudoId: Uuid): Promise<ClassificacaoOriginal | undefined>;
  /** `false` se a mesma correção já virou caso. */
  inserir(transacao: Transacao, caso: CasoCandidato): Promise<boolean>;
  buscar(transacao: Transacao, id: Uuid): Promise<CasoCandidato | undefined>;
  /** Grava a decisão se o caso ainda está pendente; `false` se outro curador decidiu antes. */
  decidir(transacao: Transacao, caso: CasoCandidato): Promise<boolean>;
  listar(
    transacao: Transacao,
    filtro: { readonly status?: StatusDoCandidato; readonly apos?: Uuid; readonly limite: number },
  ): Promise<CasoCandidato[]>;
}

const Ajuste = z.object({
  payload: z.object({
    tipoAto: z.string().min(1),
    tipoAtoAnterior: z.string().min(1).optional(),
    diasAnterior: z.number().int().nullable().optional(),
    diasNovo: z.number().int().nullable().optional(),
    publicacaoConteudoId: z.uuid().nullable().optional(),
  }),
});

export type ResultadoDoRegistro = 'registrado' | 'ja-registrado' | 'sem-publicacao' | 'sem-mudanca';

/**
 * Consumidor de PrazoAjustado (HU22): quando o advogado muda o ato ou os dias de um prazo que veio
 * de uma publicação, e a correção diverge da classificação, vira caso candidato. Repetir o evento
 * não duplica (índice único da correção).
 */
export class RegistrarCandidatoDeCuradoria<Transacao> {
  constructor(
    private readonly candidatos: RepositorioDeCandidatos<Transacao>,
    private readonly teores: LeitorDeTeor<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(transacao: Transacao, evento: unknown): Promise<ResultadoDoRegistro> {
    const p = Ajuste.parse(evento).payload;
    const conteudoId = p.publicacaoConteudoId as Uuid | null | undefined;
    if (conteudoId === null || conteudoId === undefined) return 'sem-publicacao';
    const mudouAto = p.tipoAtoAnterior !== undefined && p.tipoAtoAnterior !== p.tipoAto;
    const mudouDias = p.diasNovo !== undefined && p.diasNovo !== (p.diasAnterior ?? null);
    if (!mudouAto && !mudouDias) return 'sem-mudanca';
    const original = await this.candidatos.classificacao(transacao, conteudoId);
    const diasCorrigidos = p.diasNovo ?? null;
    // A correção concorda com a classificação (o erro foi do cálculo, não da IA).
    if (
      original?.tipoAto === p.tipoAto &&
      (!mudouDias || original.diasCitados === diasCorrigidos)
    ) {
      return 'sem-mudanca';
    }
    const teor = await this.teores.teor(transacao, conteudoId);
    // Nada falha em silêncio: publicação sumida é defeito (o evento vai para a DLQ).
    if (teor === undefined) throw new Error(`Conteúdo ${conteudoId} sem teor para a curadoria`);
    const inserido = await this.candidatos.inserir(transacao, {
      id: gerarUuidV7(this.relogio),
      conteudoId,
      teorAnonimizado: minimizarDadosPessoais(teor),
      tipoAtoClassificado: original?.tipoAto ?? null,
      tipoAtoCorrigido: p.tipoAto,
      diasCitados: original?.diasCitados ?? null,
      diasCorrigidos,
      status: 'pendente',
      motivoDecisao: null,
      decididoPor: null,
      decididoEm: null,
    });
    return inserido ? 'registrado' : 'ja-registrado';
  }
}

const Consulta = z.object({
  status: z.enum(STATUS_DO_CANDIDATO).optional(),
  cursor: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

export const EntradaDaDecisao = z
  .object({
    decisao: z.enum(['aceitar', 'descartar']),
    motivo: z.string().trim().min(10).max(1000),
    /** O curador pode terminar a anonimização antes de aceitar (CLAUDE.md, seção 11). */
    teorAnonimizado: z.string().trim().min(1).max(100_000).optional(),
  })
  .strict();

const validacao = (erro: z.ZodError) =>
  new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));

/** O curador agindo, no tenant plataforma. */
export interface CuradorDaClassificacao {
  readonly usuarioId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
}

/** Fila de casos candidatos do curador (HU22). */
export class ListarCandidatos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly candidatos: RepositorioDeCandidatos<Transacao>,
  ) {}

  async executar(
    consulta: unknown,
  ): Promise<Result<{ itens: CasoCandidato[]; proximoCursor: Uuid | null }, Validacao>> {
    const dados = Consulta.safeParse(consulta);
    if (!dados.success) return err(validacao(dados.error));
    const { status, cursor, limite } = dados.data;
    const linhas = await this.unidade.executar((tx) =>
      this.candidatos.listar(tx, {
        limite: limite + 1,
        ...(status === undefined ? {} : { status }),
        ...(cursor === undefined ? {} : { apos: cursor as Uuid }),
      }),
    );
    const itens = linhas.slice(0, limite);
    const ultimo = itens.at(-1);
    return ok({
      itens,
      proximoCursor: linhas.length > limite && ultimo !== undefined ? ultimo.id : null,
    });
  }
}

/** Aceitar (entra no conjunto de avaliação) ou descartar, com motivo e trilha (HU22). */
export class DecidirCandidato<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly candidatos: RepositorioDeCandidatos<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    curador: CuradorDaClassificacao,
    id: Uuid,
    entrada: unknown,
  ): Promise<Result<CasoCandidato, Validacao | NaoEncontrado | Conflito>> {
    const dados = EntradaDaDecisao.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const { decisao, motivo, teorAnonimizado } = dados.data;
    return this.unidade.executar(async (tx) => {
      const caso = await this.candidatos.buscar(tx, id);
      if (caso === undefined) {
        return err(new NaoEncontrado('caso-inexistente', 'Caso candidato não encontrado.'));
      }
      const decidido: CasoCandidato = {
        ...caso,
        status: decisao === 'aceitar' ? 'aceito' : 'descartado',
        motivoDecisao: motivo,
        decididoPor: curador.usuarioId,
        decididoEm: this.relogio.agora(),
        ...(teorAnonimizado === undefined ? {} : { teorAnonimizado }),
      };
      if (caso.status !== 'pendente' || !(await this.candidatos.decidir(tx, decidido))) {
        return err(new Conflito('caso-ja-decidido', 'Este caso já foi decidido.'));
      }
      await this.trilha.registrar(
        tx,
        {
          tipo: 'classificacao.caso-candidato-decidido',
          entidade: 'caso_candidato_curadoria',
          entidadeId: id,
          antes: { status: caso.status },
          depois: { status: decidido.status, motivo },
        },
        { canal: curador.canal, usuarioId: curador.usuarioId },
      );
      return ok(decidido);
    });
  }
}

/**
 * Casos aceitos no formato de `eval/casos` (HU22): o curador revisa e versiona no repositório, e
 * eles entram no próximo run de avaliação. `revisor` fica vazio: outro advogado confere.
 */
export class ExportarCasosAceitos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly candidatos: RepositorioDeCandidatos<Transacao>,
  ) {}

  async executar() {
    const aceitos = await this.unidade.executar((tx) =>
      this.candidatos.listar(tx, { status: 'aceito', limite: 1000 }),
    );
    return aceitos.map((c) => ({
      id: `correcao-${c.id}`,
      origem: 'real-anonimizado' as const,
      teor: c.teorAnonimizado,
      anotacao: {
        tipoAto: c.tipoAtoCorrigido,
        trecho: '',
        prazoCitado:
          c.diasCorrigidos === null ? null : { quantidade: c.diasCorrigidos, unidade: 'dias' },
      },
      anotador: 'curadoria',
      revisor: null,
      anonimizacaoConferidaPor: null,
    }));
  }
}
