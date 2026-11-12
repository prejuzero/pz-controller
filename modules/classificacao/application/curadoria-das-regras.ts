import { Conflito, err, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { motivoDaRecusa } from '../domain/padrao-seguro.js';

import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Instant, Result, UnidadeDeTrabalho, Uuid, Proibido } from '@pz/kernel';

export type SituacaoDaRegra = 'proposta' | 'ativa' | 'retirada' | 'substituida';

export interface VersaoDaRegra {
  readonly codigo: string;
  readonly versao: number;
  readonly tipoAto: string;
  readonly padroes: readonly string[];
  readonly confianca: number;
  readonly ativa: boolean;
  readonly propostaPor: Uuid | null;
  readonly ativadaPor: Uuid | null;
  readonly ativadaEm: Instant | null;
  readonly retiradaEm: Instant | null;
  readonly criadaEm: Instant;
}

/** Regras rápidas (tabela global `regra_classificacao`): só leitura, inserção e ativação. */
export interface RepositorioDaCuradoriaDeRegras<Transacao> {
  listar(transacao: Transacao): Promise<VersaoDaRegra[]>;
  versao(transacao: Transacao, codigo: string, versao: number): Promise<VersaoDaRegra | undefined>;
  proximaVersao(transacao: Transacao, codigo: string): Promise<number>;
  tipoAtoExiste(transacao: Transacao, tipoAto: string): Promise<boolean>;
  inserir(transacao: Transacao, regra: VersaoDaRegra): Promise<void>;
  ativar(
    transacao: Transacao,
    codigo: string,
    versao: number,
    por: Uuid,
    em: Instant,
  ): Promise<void>;
  /** Desliga todas as versões do código; devolve quantas estavam ativas. */
  retirar(transacao: Transacao, codigo: string, em: Instant): Promise<number>;
}

export interface CuradorDasRegras {
  readonly usuarioId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
}

export const PropostaDeRegra = z
  .object({
    codigo: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/),
    tipoAto: z.string().min(1).max(100),
    padroes: z
      .array(
        z
          .string()
          .min(1)
          .superRefine((padrao, ctx) => {
            const motivo = motivoDaRecusa(padrao);
            if (motivo !== undefined) ctx.addIssue({ code: 'custom', message: motivo });
          }),
      )
      .min(1)
      .max(20),
    confianca: z.number().min(0).max(1),
  })
  .strict();

/** Situação para a tela: a versão ativa mais nova vale; as ativas anteriores ficam substituídas. */
export function situacoes(regras: readonly VersaoDaRegra[]): Map<string, SituacaoDaRegra> {
  const vigente = new Map<string, number>();
  for (const r of regras) {
    if (r.ativa && r.versao > (vigente.get(r.codigo) ?? 0)) vigente.set(r.codigo, r.versao);
  }
  return new Map(
    regras.map((r) => [
      `${r.codigo}@${String(r.versao)}`,
      r.ativa
        ? vigente.get(r.codigo) === r.versao
          ? 'ativa'
          : 'substituida'
        : r.ativadaPor === null
          ? 'proposta'
          : 'retirada',
    ]),
  );
}

const validacao = (erro: z.ZodError) =>
  new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));

/**
 * Curadoria das regras rápidas pelo portal (PZ-313). As regras classificam o ato antes da IA
 * (CLAUDE.md, seção 11) e levam ao prazo: por isso a versão proposta nasce inativa e só vale
 * depois de ativada pela curadoria, que pode ativar a própria proposta (decisão do usuário em
 * 11/11/2026: uma curadora só). Toda mudança fica na trilha, no tenant da curadoria.
 */
export class CuradoriaDasRegras<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly regras: RepositorioDaCuradoriaDeRegras<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  listar(): Promise<VersaoDaRegra[]> {
    return this.unidade.executar((tx) => this.regras.listar(tx));
  }

  async propor(
    curador: CuradorDasRegras,
    entrada: unknown,
  ): Promise<Result<VersaoDaRegra, Validacao>> {
    const dados = PropostaDeRegra.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    return this.unidade.executar(async (tx) => {
      if (!(await this.regras.tipoAtoExiste(tx, dados.data.tipoAto))) {
        return err(
          new Validacao([{ campo: 'tipoAto', mensagem: 'Tipo de ato fora da taxonomia.' }]),
        );
      }
      const regra: VersaoDaRegra = {
        ...dados.data,
        versao: await this.regras.proximaVersao(tx, dados.data.codigo),
        ativa: false,
        propostaPor: curador.usuarioId,
        ativadaPor: null,
        ativadaEm: null,
        retiradaEm: null,
        criadaEm: this.relogio.agora(),
      };
      await this.regras.inserir(tx, regra);
      await this.#auditar(tx, curador, 'classificacao.regra-proposta', regra);
      return ok(regra);
    });
  }

  async ativar(
    curador: CuradorDasRegras,
    codigo: string,
    versao: number,
  ): Promise<Result<void, NaoEncontrado | Proibido | Conflito>> {
    return this.unidade.executar(async (tx) => {
      const regra = await this.regras.versao(tx, codigo, versao);
      if (regra === undefined) {
        return err(new NaoEncontrado('regra-inexistente', 'Versão de regra não encontrada.'));
      }
      if (regra.ativadaPor !== null) {
        return err(new Conflito('regra-ja-decidida', 'Esta versão já foi ativada ou retirada.'));
      }
      await this.regras.ativar(tx, codigo, versao, curador.usuarioId, this.relogio.agora());
      await this.#auditar(tx, curador, 'classificacao.regra-ativada', regra);
      return ok(undefined);
    });
  }

  async retirar(curador: CuradorDasRegras, codigo: string): Promise<Result<void, NaoEncontrado>> {
    return this.unidade.executar(async (tx) => {
      if ((await this.regras.retirar(tx, codigo, this.relogio.agora())) === 0) {
        return err(new NaoEncontrado('regra-inexistente', 'Não há regra ativa com este código.'));
      }
      await this.trilha.registrar(
        tx,
        {
          tipo: 'classificacao.regra-retirada',
          entidade: 'regra_classificacao',
          entidadeId: codigo,
        },
        { canal: curador.canal, usuarioId: curador.usuarioId },
      );
      return ok(undefined);
    });
  }

  #auditar(
    tx: Transacao,
    curador: CuradorDasRegras,
    tipo: 'classificacao.regra-proposta' | 'classificacao.regra-ativada',
    r: VersaoDaRegra,
  ) {
    return this.trilha.registrar(
      tx,
      {
        tipo,
        entidade: 'regra_classificacao',
        entidadeId: `${r.codigo}@${String(r.versao)}`,
        depois: { tipoAto: r.tipoAto, padroes: r.padroes, confianca: r.confianca },
      },
      { canal: curador.canal, usuarioId: curador.usuarioId },
    );
  }
}
