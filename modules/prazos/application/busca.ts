import { ok } from '@pz/kernel';

import { prazoListado } from './prazos.js';

import type { FiltroDaBuscaDePrazos, RepositorioDePrazos } from './portas.js';
import type { PrazoListado } from './prazos.js';
import type { Result, UnidadeDeTrabalho, Validacao } from '@pz/kernel';

/** Teto da contagem: acima dele a tela mostra "mais de N" (contagem exata custa caro). */
export const TETO_DA_CONTAGEM = 1000;

export interface PaginaDaBuscaDePrazos {
  readonly itens: PrazoListado[];
  /** Último da página (data alvo e id), para a próxima. */
  readonly ultimo: { readonly data: string | null; readonly id: string } | null;
  readonly totalAproximado: number;
  readonly totalLimitado: boolean;
}

/**
 * Prazos do tenant na busca avançada (HU28). Os filtros que dependem de outros módulos (processo,
 * teor, OAB) chegam já resolvidos em ids pelo módulo busca.
 */
export class BuscarPrazos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly prazos: RepositorioDePrazos<Transacao>,
  ) {}

  async executar(filtro: FiltroDaBuscaDePrazos): Promise<Result<PaginaDaBuscaDePrazos, Validacao>> {
    const { linhas, total } = await this.unidade.executar(async (tx) => ({
      linhas: await this.prazos.buscarComFiltros(tx, { ...filtro, limite: filtro.limite + 1 }),
      total: await this.prazos.contarNaBusca(tx, filtro, TETO_DA_CONTAGEM + 1),
    }));
    const itens = linhas.slice(0, filtro.limite);
    const ultimo = linhas.length > filtro.limite ? itens.at(-1) : undefined;
    const data = (p: (typeof itens)[number]) =>
      (filtro.campoData === 'inicio'
        ? p.estado.calculo.inicio
        : p.estado.calculo.vencimento
      )?.paraIso() ?? null;
    return ok({
      itens: itens.map((p) => prazoListado(p.estado)),
      ultimo: ultimo === undefined ? null : { data: data(ultimo), id: ultimo.id },
      totalAproximado: Math.min(total, TETO_DA_CONTAGEM),
      totalLimitado: total > TETO_DA_CONTAGEM,
    });
  }
}
