import type { Classificacao } from '../domain/decisao.js';
import type { Instant, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Conteúdo que nem as regras nem a IA conseguiram classificar e aguarda o curador (HU21). */
export interface ItemDaRevisaoManual {
  readonly conteudoId: Uuid;
  readonly origem: Classificacao['origem'];
  readonly motivo: NonNullable<Classificacao['motivo']> | null;
  readonly tipoAto: string | null;
  readonly confianca: number | null;
  readonly evidencias: Classificacao['evidencias'];
  readonly versaoPrompt: string | null;
  readonly modelo: string | null;
  readonly criadaEm: Instant;
}

/** Porta: classificações em "revisao_manual", da mais antiga para a mais nova. */
export interface ConsultaDaRevisaoManual<Transacao> {
  /** `apos` é o último conteúdo da página anterior. */
  listar(
    transacao: Transacao,
    pagina: { readonly limite: number; readonly apos?: Uuid },
  ): Promise<ItemDaRevisaoManual[]>;
}

export interface PaginaDaRevisaoManual {
  readonly itens: readonly ItemDaRevisaoManual[];
  readonly proximoCursor: Uuid | null;
}

/**
 * Fila de revisão manual do curador (HU21): classificações globais (uma por conteúdo) em
 * "revisao_manual". Só leitura; a correção pelo curador entra com a curadoria da HU22.
 */
export class ListarRevisaoManual<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly consulta: ConsultaDaRevisaoManual<Transacao>,
  ) {}

  async executar(pagina: {
    readonly limite: number;
    readonly apos?: Uuid;
  }): Promise<PaginaDaRevisaoManual> {
    const linhas = await this.unidade.executar((tx) =>
      this.consulta.listar(tx, { ...pagina, limite: pagina.limite + 1 }),
    );
    const itens = linhas.slice(0, pagina.limite);
    const ultimo = itens.at(-1);
    return {
      itens,
      proximoCursor:
        linhas.length > pagina.limite && ultimo !== undefined ? ultimo.conteudoId : null,
    };
  }
}
