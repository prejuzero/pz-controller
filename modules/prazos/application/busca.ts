import { hoje, ok } from '@pz/kernel';

import { contadorDeDiasUteis } from './dias-uteis.js';
import { prazoListado } from './prazos.js';

import type { PrazoComDiasUteis } from './ciclo-de-vida.js';
import type {
  FiltroDaBuscaDePrazos,
  LocalizadorDoProcesso,
  RepositorioDePrazos,
} from './portas.js';
import type { Clock, Result, UnidadeDeTrabalho, Validacao } from '@pz/kernel';

/** Teto da contagem: acima dele a tela mostra "mais de N" (contagem exata custa caro). */
export const TETO_DA_CONTAGEM = 1000;

export interface PaginaDaBuscaDePrazos {
  readonly itens: PrazoComDiasUteis[];
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
    /** Calendário do processo para os dias úteis restantes (portal); sem ele, ficam nulos. */
    private readonly diasUteis?: { localizar: LocalizadorDoProcesso; relogio: Clock },
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
    const contar =
      this.diasUteis === undefined
        ? undefined
        : contadorDeDiasUteis(this.diasUteis.localizar, hoje(this.diasUteis.relogio));
    return ok({
      itens: await Promise.all(
        itens.map(async (p) => ({
          ...prazoListado(p.estado),
          diasUteisRestantes: contar === undefined ? null : await contar(p),
        })),
      ),
      ultimo: ultimo === undefined ? null : { data: data(ultimo), id: ultimo.id },
      totalAproximado: Math.min(total, TETO_DA_CONTAGEM),
      totalLimitado: total > TETO_DA_CONTAGEM,
    });
  }
}
