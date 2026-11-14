import {
  classeProcessualCanonica,
  Conflito,
  err,
  gerarUuidV7,
  NaoEncontrado,
  ok,
  Validacao,
} from '@pz/kernel';
import { z } from 'zod';

import { RAMOS } from '../domain/tabela.js';

import type { Ramo } from '../domain/tabela.js';
import type { CuradorEmAcao } from './tabela-de-prazos.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Instant, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/**
 * Correspondência classe processual → ramo (decisão do usuário em 14/11/2026). O DJEN informa a
 * classe (Tabelas Processuais Unificadas do CNJ), não o rito; sem o ramo, o prazo da justiça
 * estadual fica "a confirmar". A curadoria propõe e aprova cada correspondência, com o fundamento
 * (CLAUDE.md, seção 4.3): o código nunca decide o ramo de uma classe (seção 4.6).
 */
export interface VersaoDoRamoDaClasse {
  readonly id: Uuid;
  readonly classe: string;
  readonly ramo: Ramo;
  readonly versao: number;
  readonly fundamento: string;
  readonly fonteUrl: string;
  readonly status: 'rascunho' | 'aprovado';
  readonly propostoPor: Uuid;
  readonly propostoEm: Instant;
  readonly aprovadoPor?: Uuid;
  readonly aprovadoEm?: Instant;
}

/** Porta: as versões, globais, na transação do curador (tenant plataforma) ou do job. */
export interface RepositorioDosRamosDasClasses<Transacao> {
  listar(transacao: Transacao): Promise<VersaoDoRamoDaClasse[]>;
  buscar(transacao: Transacao, id: Uuid): Promise<VersaoDoRamoDaClasse | undefined>;
  proximaVersao(transacao: Transacao, classe: string): Promise<number>;
  /** Falso se outra proposta usou o mesmo número (índice único). */
  inserir(transacao: Transacao, versao: VersaoDoRamoDaClasse): Promise<boolean>;
  /** Falso se a versão não era mais rascunho. */
  aprovar(transacao: Transacao, id: Uuid, por: Uuid, em: Instant): Promise<boolean>;
  /** Ramo da última versão aprovada da classe (forma canônica). */
  ramoAprovado(transacao: Transacao, classe: string): Promise<Ramo | undefined>;
}

/** Porta: classes que já chegaram nas publicações (módulo publicacoes), com quantas vezes. */
export interface ClassesVistas<Transacao> {
  listar(transacao: Transacao): Promise<{ classe: string; ocorrencias: number }[]>;
}

export interface VersaoDoRamoListada {
  readonly id: Uuid;
  readonly classe: string;
  readonly ramo: Ramo;
  readonly versao: number;
  readonly fundamento: string;
  readonly fonteUrl: string;
  readonly status: 'rascunho' | 'aprovado';
  readonly propostoPor: Uuid;
  readonly propostoEm: string;
  readonly aprovadoPor: Uuid | null;
  readonly aprovadoEm: string | null;
}

export interface ClasseNaCuradoria {
  readonly classe: string;
  /** Publicações recebidas com a classe (0: proposta antes de chegar alguma). */
  readonly ocorrencias: number;
  /** A que vale: a última versão aprovada. */
  readonly aprovada: VersaoDoRamoListada | null;
  /** Rascunho mais novo que a aprovada, à espera da curadoria. */
  readonly rascunho: VersaoDoRamoListada | null;
}

const listada = (v: VersaoDoRamoDaClasse): VersaoDoRamoListada => ({
  id: v.id,
  classe: v.classe,
  ramo: v.ramo,
  versao: v.versao,
  fundamento: v.fundamento,
  fonteUrl: v.fonteUrl,
  status: v.status,
  propostoPor: v.propostoPor,
  propostoEm: v.propostoEm.paraIso(),
  aprovadoPor: v.aprovadoPor ?? null,
  aprovadoEm: v.aprovadoEm?.paraIso() ?? null,
});

/** Classes vistas e as já propostas, com a versão que vale e o rascunho pendente. */
export class ListarRamosDasClasses<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly ramos: RepositorioDosRamosDasClasses<Transacao>,
    private readonly vistas: ClassesVistas<Transacao>,
  ) {}

  async executar(): Promise<ClasseNaCuradoria[]> {
    const { versoes, vistas } = await this.unidade.executar(async (tx) => ({
      versoes: await this.ramos.listar(tx),
      vistas: await this.vistas.listar(tx),
    }));
    const ocorrencias = new Map(vistas.map((v) => [v.classe, v.ocorrencias]));
    const classes = new Set([...ocorrencias.keys(), ...versoes.map((v) => v.classe)]);
    return [...classes]
      .map((classe) => {
        const daClasse = versoes
          .filter((v) => v.classe === classe)
          .sort((a, b) => b.versao - a.versao);
        const aprovada = daClasse.find((v) => v.status === 'aprovado');
        const rascunho = daClasse.find(
          (v) => v.status === 'rascunho' && v.versao > (aprovada?.versao ?? 0),
        );
        return {
          classe,
          ocorrencias: ocorrencias.get(classe) ?? 0,
          aprovada: aprovada === undefined ? null : listada(aprovada),
          rascunho: rascunho === undefined ? null : listada(rascunho),
        };
      })
      .sort((a, b) => b.ocorrencias - a.ocorrencias || a.classe.localeCompare(b.classe));
  }
}

const EntradaDoRamo = z
  .object({
    classe: z.string().max(300),
    ramo: z.enum(RAMOS),
    fundamento: z.string().trim().min(3).max(500),
    fonteUrl: z.url({ protocol: /^https$/ }).max(500),
  })
  .strict();

/** Propõe o ramo de uma classe: nasce rascunho e só vale depois de aprovado. */
export class ProporRamoDaClasse<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly ramos: RepositorioDosRamosDasClasses<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    curador: CuradorEmAcao,
    entrada: unknown,
  ): Promise<Result<VersaoDoRamoListada, Validacao | Conflito>> {
    const dados = EntradaDoRamo.safeParse(entrada);
    const classe = dados.success ? classeProcessualCanonica(dados.data.classe) : undefined;
    if (!dados.success || classe === undefined) {
      const problemas = dados.success
        ? [{ campo: 'classe', mensagem: 'Classe processual de 3 a 200 caracteres.' }]
        : dados.error.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message }));
      return err(new Validacao(problemas));
    }
    return this.unidade.executar(async (tx) => {
      const versao: VersaoDoRamoDaClasse = {
        id: gerarUuidV7(this.relogio),
        classe,
        ramo: dados.data.ramo,
        versao: await this.ramos.proximaVersao(tx, classe),
        fundamento: dados.data.fundamento,
        fonteUrl: dados.data.fonteUrl,
        status: 'rascunho',
        propostoPor: curador.usuarioId,
        propostoEm: this.relogio.agora(),
      };
      if (!(await this.ramos.inserir(tx, versao))) {
        return err(
          new Conflito('versao-concorrente', 'Outra proposta usou este número; tente de novo.'),
        );
      }
      const depois = listada(versao);
      await this.trilha.registrar(
        tx,
        {
          tipo: 'prazos.ramo-da-classe-proposto',
          entidade: 'ramo_da_classe',
          entidadeId: versao.id,
          depois,
        },
        { canal: curador.canal, usuarioId: curador.usuarioId },
      );
      return ok(depois);
    });
  }
}

/**
 * Aprova o ramo de uma classe (a própria curadora pode aprovar, decisão de 11/11/2026). Publica
 * RamoDaClasseAprovado: o worker refaz a sugestão dos prazos do DJEN que ainda estão sem data.
 */
export class AprovarRamoDaClasse<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly ramos: RepositorioDosRamosDasClasses<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    curador: CuradorEmAcao,
    id: Uuid,
  ): Promise<Result<VersaoDoRamoListada, NaoEncontrado | Conflito>> {
    return this.unidade.executar(async (tx) => {
      const versao = await this.ramos.buscar(tx, id);
      if (versao === undefined) {
        return err(new NaoEncontrado('versao-inexistente', 'Correspondência não encontrada.'));
      }
      const agora = this.relogio.agora();
      if (
        versao.status !== 'rascunho' ||
        !(await this.ramos.aprovar(tx, id, curador.usuarioId, agora))
      ) {
        return err(new Conflito('versao-ja-aprovada', 'Esta versão já foi aprovada.'));
      }
      const antes = listada(versao);
      const depois = listada({
        ...versao,
        status: 'aprovado',
        aprovadoPor: curador.usuarioId,
        aprovadoEm: agora,
      });
      await this.trilha.registrar(
        tx,
        {
          tipo: 'prazos.ramo-da-classe-aprovado',
          entidade: 'ramo_da_classe',
          entidadeId: id,
          antes,
          depois,
        },
        { canal: curador.canal, usuarioId: curador.usuarioId },
      );
      await this.outbox.gravar(tx, [
        {
          id: gerarUuidV7(this.relogio),
          tipo: 'RamoDaClasseAprovado',
          versao: 1,
          tenantId: curador.tenantId,
          agregadoId: id,
          ocorridoEm: agora,
          payload: { versaoId: id, classe: versao.classe, ramo: versao.ramo },
        },
      ]);
      return ok(depois);
    });
  }
}
