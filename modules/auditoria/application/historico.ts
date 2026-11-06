import { calcularHash } from '../domain/cadeia.js';
import { codigoDeVerificacao, lerCodigo } from '../domain/verificacao.js';

import type { RegistroEncadeado, Sha256 } from '../domain/cadeia.js';
import type { UnidadeDeTrabalho } from '@pz/kernel';

/** Registro da trilha que pertence ao histórico (ex.: o prazo e as notificações dele). */
export interface AlvoDoHistorico {
  readonly entidade: string;
  readonly entidadeId: string;
}

/** Emissão de um histórico verificável: quais registros o PDF trouxe (HU35). */
export interface Verificacao {
  readonly codigo: string;
  readonly tenantId: string;
  readonly entidade: string;
  readonly entidadeId: string;
  readonly sequencias: readonly number[];
}

/** Porta: leitura do histórico e das emissões, no tenant da transação (RLS). */
export interface RepositorioDoHistorico<Transacao> {
  porEntidades(
    tx: Transacao,
    tenantId: string,
    alvos: readonly AlvoDoHistorico[],
    limite: number,
  ): Promise<RegistroEncadeado[]>;
  porSequencias(
    tx: Transacao,
    tenantId: string,
    sequencias: readonly number[],
  ): Promise<RegistroEncadeado[]>;
  /** Mesmo trecho = mesmo código: repetir não grava de novo. */
  gravarVerificacao(tx: Transacao, verificacao: Verificacao): Promise<void>;
  verificacao(
    tx: Transacao,
    codigo: string,
  ): Promise<(Verificacao & { emitidaEm: string }) | undefined>;
}

/** O que o histórico mostra: sem IP, agente nem o usuário real (dados de acesso ficam na trilha). */
export type EventoDoHistorico = Pick<
  RegistroEncadeado,
  | 'sequencia'
  | 'tipo'
  | 'entidade'
  | 'entidadeId'
  | 'usuarioId'
  | 'canal'
  | 'antes'
  | 'depois'
  | 'criadoEm'
  | 'hashAnterior'
  | 'hash'
>;

/** Teto do histórico de um prazo: cobre com folga o ciclo de vida (aceite: 500 eventos). */
export const MAXIMO_DO_HISTORICO = 2_000;

const paraEvento = (r: RegistroEncadeado): EventoDoHistorico => ({
  sequencia: r.sequencia,
  tipo: r.tipo,
  entidade: r.entidade,
  entidadeId: r.entidadeId,
  usuarioId: r.usuarioId,
  canal: r.canal,
  antes: r.antes,
  depois: r.depois,
  criadoEm: r.criadoEm,
  hashAnterior: r.hashAnterior,
  hash: r.hash,
});

/** Histórico de um prazo (HU35, RF86): somente leitura, em ordem da cadeia, no tenant (RLS). */
export class ConsultarHistorico<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly repositorio: RepositorioDoHistorico<Transacao>,
  ) {}

  async executar(
    tenantId: string,
    alvos: readonly AlvoDoHistorico[],
  ): Promise<EventoDoHistorico[]> {
    const registros = await this.unidade.executar((tx) =>
      this.repositorio.porEntidades(tx, tenantId, alvos, MAXIMO_DO_HISTORICO),
    );
    return registros.map(paraEvento);
  }
}

/**
 * Histórico verificável (HU35, RF87): os eventos e o código que os amarra. A emissão fica
 * gravada para a verificação pública conferir o mesmo trecho contra a cadeia.
 */
export class EmitirHistoricoVerificavel<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly repositorio: RepositorioDoHistorico<Transacao>,
    private readonly sha256: Sha256,
  ) {}

  executar(
    tenantId: string,
    principal: AlvoDoHistorico,
    alvos: readonly AlvoDoHistorico[],
  ): Promise<{ eventos: EventoDoHistorico[]; codigo: string }> {
    return this.unidade.executar(async (tx) => {
      const registros = await this.repositorio.porEntidades(
        tx,
        tenantId,
        alvos,
        MAXIMO_DO_HISTORICO,
      );
      const codigo = codigoDeVerificacao(tenantId, registros, this.sha256);
      await this.repositorio.gravarVerificacao(tx, {
        codigo,
        tenantId,
        ...principal,
        sequencias: registros.map((r) => r.sequencia),
      });
      return { eventos: registros.map(paraEvento), codigo };
    });
  }
}

export type ResultadoDaVerificacaoPublica =
  | {
      readonly situacao: 'valido';
      readonly emitidaEm: string;
      /** Só o necessário para conferir o PDF: nada do conteúdo dos eventos. */
      readonly eventos: readonly Pick<
        RegistroEncadeado,
        'sequencia' | 'tipo' | 'criadoEm' | 'hash'
      >[];
    }
  | { readonly situacao: 'inexistente' }
  | { readonly situacao: 'divergente'; readonly motivo: string };

export type NoTenantDoHistorico = <T>(tenantId: string, trabalho: () => Promise<T>) => Promise<T>;

/**
 * Verificação pública do PDF (HU35): o código diz o tenant e o resumo; os registros emitidos são
 * relidos e cada hash recalculado. Registro alterado, apagado ou código trocado: divergente.
 */
export class VerificarHistorico<Transacao> {
  constructor(
    private readonly noTenant: NoTenantDoHistorico,
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly repositorio: RepositorioDoHistorico<Transacao>,
    private readonly sha256: Sha256,
  ) {}

  async executar(codigo: string): Promise<ResultadoDaVerificacaoPublica> {
    const lido = lerCodigo(codigo);
    if (lido === undefined) return { situacao: 'inexistente' };
    return this.noTenant(lido.tenantId, () =>
      this.unidade.executar(async (tx): Promise<ResultadoDaVerificacaoPublica> => {
        const emitida = await this.repositorio.verificacao(tx, codigo);
        if (emitida === undefined) return { situacao: 'inexistente' };
        const registros = await this.repositorio.porSequencias(
          tx,
          lido.tenantId,
          emitida.sequencias,
        );
        if (registros.length !== emitida.sequencias.length) {
          return { situacao: 'divergente', motivo: 'registro ausente na trilha' };
        }
        for (const r of registros) {
          const { hash, hashAnterior, ...semHash } = r;
          if (calcularHash(hashAnterior, semHash, this.sha256) !== hash) {
            return {
              situacao: 'divergente',
              motivo: `registro ${String(r.sequencia)} alterado (hash não confere)`,
            };
          }
        }
        if (codigoDeVerificacao(lido.tenantId, registros, this.sha256) !== codigo) {
          return { situacao: 'divergente', motivo: 'código não confere com a trilha' };
        }
        return {
          situacao: 'valido',
          emitidaEm: emitida.emitidaEm,
          eventos: registros.map((r) => ({
            sequencia: r.sequencia,
            tipo: r.tipo,
            criadoEm: r.criadoEm,
            hash: r.hash,
          })),
        };
      }),
    );
  }
}

/** Quem consulta o histórico: o usuário e se ele vê o de todos (administrador do escritório). */
export interface LeitorDoHistorico {
  readonly usuarioId: string;
  readonly veTodos: boolean;
}

/**
 * Escopo do histórico do prazo (HU41, RF88): o administrador do escritório vê o de todos; os
 * demais, só o dos prazos sob a responsabilidade deles. Prazo sem responsável: só o administrador.
 */
export function podeVerHistoricoDoPrazo(
  leitor: LeitorDoHistorico,
  responsavelId: string | null,
): boolean {
  return leitor.veTodos || (responsavelId !== null && responsavelId === leitor.usuarioId);
}
