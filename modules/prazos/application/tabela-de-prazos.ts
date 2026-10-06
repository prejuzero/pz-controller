import { Conflito, err, LocalDate, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { CODIGO_MANIFESTACAO_GENERICA, resolverPrazo } from '../domain/resolucao.js';
import { RAMOS, UNIDADES, VersaoDaTabela } from '../domain/tabela.js';

import type {
  FiltroDeVersoes,
  RepositorioDaTabela,
  RepositorioDeTiposDeAto,
  TipoDeAto,
} from './portas.js';
import type { PrazoResolvido } from '../domain/resolucao.js';
import type { ConteudoDaVersao, Curador, EstadoDaVersao } from '../domain/tabela.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Outbox, Proibido, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

const Data = z.string().transform((texto, contexto) => {
  const data = LocalDate.analisar(texto);
  if (data.ok) return data.valor;
  contexto.addIssue({ code: 'custom', message: 'Data inválida (AAAA-MM-DD).' });
  return z.NEVER;
});
const CodigoDeAto = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Código de ato inválido.')
  .max(80);

export const EntradaTipoDeAto = z
  .object({
    codigo: CodigoDeAto,
    nome: z.string().trim().min(1).max(200),
    descricao: z.string().trim().max(2000),
    sinonimos: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  })
  .strict();

export const EntradaProposta = z
  .object({
    tipoAto: CodigoDeAto,
    ramo: z.enum(RAMOS),
    dias: z.number().int().positive().max(10_000),
    unidade: z.enum(UNIDADES),
    fundamento: z.string().trim().min(1).max(500),
    fonteUrl: z.url({ protocol: /^https$/ }).max(2000),
    vigenciaInicio: Data,
    vigenciaFim: Data.optional(),
  })
  .strict();

export const EntradaResolucao = z
  .object({
    tipoAto: CodigoDeAto,
    ramo: z.enum(RAMOS),
    dataDoAto: Data,
    prazoNoTexto: z
      .object({ dias: z.number().int().positive().max(10_000), unidade: z.enum(UNIDADES) })
      .strict()
      .optional(),
  })
  .strict();

/** O curador agindo, e por qual canal (vai para a trilha). */
export interface CuradorEmAcao extends Curador {
  readonly canal: OrigemDaAuditoria['canal'];
}

function validacao(erro: z.ZodError): Validacao {
  return new Validacao(
    erro.issues.map((problema) => ({ campo: problema.path.join('.'), mensagem: problema.message })),
  );
}

/** Representação serializável de uma versão (auditoria, listagem, API). */
export interface VersaoListada {
  readonly id: Uuid;
  readonly tipoAto: string;
  readonly ramo: string;
  readonly versao: number;
  readonly dias: number;
  readonly unidade: string;
  readonly fundamento: string;
  readonly fonteUrl: string;
  readonly vigenciaInicio: string;
  readonly vigenciaFim: string | null;
  readonly status: string;
  readonly propostoPor: Uuid;
  readonly propostoEm: string;
  readonly aprovadoPor: Uuid | null;
  readonly aprovadoEm: string | null;
}

export function listada(estado: EstadoDaVersao): VersaoListada {
  return {
    id: estado.id,
    tipoAto: estado.tipoAto,
    ramo: estado.ramo,
    versao: estado.versao,
    dias: estado.dias,
    unidade: estado.unidade,
    fundamento: estado.fundamento,
    fonteUrl: estado.fonteUrl,
    vigenciaInicio: estado.vigenciaInicio.paraIso(),
    vigenciaFim: estado.vigenciaFim?.paraIso() ?? null,
    status: estado.status,
    propostoPor: estado.propostoPor,
    propostoEm: estado.propostoEm.paraIso(),
    aprovadoPor: estado.aprovadoPor ?? null,
    aprovadoEm: estado.aprovadoEm?.paraIso() ?? null,
  };
}

/**
 * Casos de uso da tabela de prazos (HU15). Escrevem em tabelas globais na transação do tenant
 * plataforma do curador (o chamador define o tenant da sessão), com auditoria e eventos na mesma
 * transação (ADR-004, ADR-006). Quem é curador é verificado na API (permissão, HU07).
 */
export class CadastrarTipoDeAto<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly tipos: RepositorioDeTiposDeAto<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
  ) {}

  async executar(
    curador: CuradorEmAcao,
    entrada: unknown,
  ): Promise<Result<string, Validacao | Conflito>> {
    const dados = EntradaTipoDeAto.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const tipo: TipoDeAto = dados.data;
    return this.unidade.executar(async (transacao) => {
      if (!(await this.tipos.inserir(transacao, tipo))) {
        return err(
          new Conflito('tipo-de-ato-existente', 'Já existe um tipo de ato com este código.'),
        );
      }
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'prazos.tipo-de-ato-cadastrado',
          entidade: 'tipo_ato',
          entidadeId: tipo.codigo,
          depois: tipo,
        },
        { canal: curador.canal, usuarioId: curador.usuarioId },
      );
      return ok(tipo.codigo);
    });
  }
}

export class ProporVersaoDaTabela<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly tipos: RepositorioDeTiposDeAto<Transacao>,
    private readonly tabela: RepositorioDaTabela<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    curador: CuradorEmAcao,
    entrada: unknown,
  ): Promise<Result<VersaoListada, Validacao | Conflito>> {
    const dados = EntradaProposta.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const { vigenciaFim, ...resto } = dados.data;
    const conteudo: ConteudoDaVersao =
      vigenciaFim === undefined ? resto : { ...resto, vigenciaFim };
    return this.unidade.executar(async (transacao) => {
      if (!(await this.tipos.existe(transacao, conteudo.tipoAto))) {
        return err(new Validacao([{ campo: 'tipoAto', mensagem: 'Tipo de ato não cadastrado.' }]));
      }
      const numero = await this.tabela.proximaVersao(transacao, conteudo.tipoAto, conteudo.ramo);
      const proposta = VersaoDaTabela.propor(conteudo, numero, curador, this.relogio);
      if (!proposta.ok) return err(proposta.erro);
      if (!(await this.tabela.inserir(transacao, proposta.valor))) {
        return err(
          new Conflito('versao-concorrente', 'Outra proposta usou este número; tente de novo.'),
        );
      }
      const depois = listada(proposta.valor.estado);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'prazos.versao-da-tabela-proposta',
          entidade: 'tabela_prazo',
          entidadeId: depois.id,
          depois,
        },
        { canal: curador.canal, usuarioId: curador.usuarioId },
      );
      return ok(depois);
    });
  }
}

export class AprovarVersaoDaTabela<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly tabela: RepositorioDaTabela<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    curador: CuradorEmAcao,
    versaoId: Uuid,
  ): Promise<Result<VersaoListada, NaoEncontrado | Proibido | Conflito>> {
    return this.unidade.executar(async (transacao) => {
      const versao = await this.tabela.buscar(transacao, versaoId);
      if (versao === undefined) {
        return err(new NaoEncontrado('versao-inexistente', 'Versão da tabela não encontrada.'));
      }
      const antes = listada(versao.estado);
      const aprovacao = versao.aprovar(curador, this.relogio);
      if (!aprovacao.ok) return err(aprovacao.erro);
      if (!(await this.tabela.registrarAprovacao(transacao, versao))) {
        return err(new Conflito('versao-ja-aprovada', 'Esta versão já foi aprovada.'));
      }
      const depois = listada(versao.estado);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'prazos.versao-da-tabela-aprovada',
          entidade: 'tabela_prazo',
          entidadeId: depois.id,
          antes,
          depois,
        },
        { canal: curador.canal, usuarioId: curador.usuarioId },
      );
      await this.outbox.gravar(transacao, versao.retirarEventos());
      return ok(depois);
    });
  }
}

export class ConsultarTabelaDePrazos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly repositorioDeTipos: RepositorioDeTiposDeAto<Transacao>,
    private readonly tabela: RepositorioDaTabela<Transacao>,
  ) {}

  tiposDeAto(): Promise<TipoDeAto[]> {
    return this.unidade.executar((transacao) => this.repositorioDeTipos.listar(transacao));
  }

  async versoes(filtro: FiltroDeVersoes): Promise<VersaoListada[]> {
    const versoes = await this.unidade.executar((transacao) =>
      this.tabela.listar(transacao, filtro),
    );
    return versoes.map((versao) => listada(versao.estado));
  }
}

/**
 * Prazo aplicável a um ato na data dele (HU15): `resolverPrazo(tipoAto, ramo, dataAto,
 * prazoNoTexto?)`. Devolve quantidade e unidade, nunca uma data: datas só no motor (ADR-007).
 */
export class ResolverPrazoAplicavel<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly tabela: RepositorioDaTabela<Transacao>,
  ) {}

  async executar(entrada: unknown): Promise<Result<PrazoResolvido, Validacao>> {
    const dados = EntradaResolucao.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const { tipoAto, ramo, dataDoAto, prazoNoTexto } = dados.data;
    const [versoesDoAto, versoesGenericas] = await this.unidade.executar(async (transacao) => [
      await this.tabela.listar(transacao, { tipoAto, ramo }),
      tipoAto === CODIGO_MANIFESTACAO_GENERICA
        ? []
        : await this.tabela.listar(transacao, { tipoAto: CODIGO_MANIFESTACAO_GENERICA, ramo }),
    ]);
    return ok(
      resolverPrazo({
        dataDoAto,
        versoesDoAto,
        versoesGenericas,
        ...(prazoNoTexto === undefined ? {} : { prazoNoTexto }),
      }),
    );
  }
}
