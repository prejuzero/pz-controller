import { VersaoDaTabela } from '../domain/tabela.js';

import type {
  FiltroDeVersoes,
  RepositorioDaTabela,
  RepositorioDeTiposDeAto,
  TipoDeAto,
} from '../application/portas.js';
import type { EstadoDaVersao, Ramo } from '../domain/tabela.js';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Repositórios em memória da tabela de prazos, com a semântica do Postgres. Só para testes. */
export class TabelaEmMemoria
  implements RepositorioDaTabela<TransacaoEmMemoria>, RepositorioDeTiposDeAto<TransacaoEmMemoria>
{
  readonly #tipos = new Map<string, TipoDeAto>();
  readonly #versoes = new Map<string, EstadoDaVersao>();

  existe(_transacao: TransacaoEmMemoria, codigo: string): Promise<boolean> {
    return Promise.resolve(this.#tipos.has(codigo));
  }

  inserir(transacao: TransacaoEmMemoria, item: TipoDeAto | VersaoDaTabela): Promise<boolean> {
    if (item instanceof VersaoDaTabela) {
      const e = item.estado;
      const repetida = [...this.#versoes.values()].some(
        (v) => v.tipoAto === e.tipoAto && v.ramo === e.ramo && v.versao === e.versao,
      );
      if (repetida || !this.#tipos.has(e.tipoAto)) return Promise.resolve(false);
      transacao.aoConfirmar(() => this.#versoes.set(e.id, e));
      return Promise.resolve(true);
    }
    if (this.#tipos.has(item.codigo)) return Promise.resolve(false);
    transacao.aoConfirmar(() => this.#tipos.set(item.codigo, item));
    return Promise.resolve(true);
  }

  listar(transacao: TransacaoEmMemoria): Promise<TipoDeAto[]>;
  listar(transacao: TransacaoEmMemoria, filtro: FiltroDeVersoes): Promise<VersaoDaTabela[]>;
  listar(
    _transacao: TransacaoEmMemoria,
    filtro?: FiltroDeVersoes,
  ): Promise<TipoDeAto[] | VersaoDaTabela[]> {
    if (filtro === undefined) return Promise.resolve([...this.#tipos.values()]);
    return Promise.resolve(
      [...this.#versoes.values()]
        .filter(
          (v) =>
            (filtro.tipoAto === undefined || v.tipoAto === filtro.tipoAto) &&
            (filtro.ramo === undefined || v.ramo === filtro.ramo),
        )
        .map((v) => VersaoDaTabela.restaurar(v)),
    );
  }

  proximaVersao(_transacao: TransacaoEmMemoria, tipoAto: string, ramo: Ramo): Promise<number> {
    const numeros = [...this.#versoes.values()]
      .filter((v) => v.tipoAto === tipoAto && v.ramo === ramo)
      .map((v) => v.versao);
    return Promise.resolve(Math.max(0, ...numeros) + 1);
  }

  buscar(_transacao: TransacaoEmMemoria, id: Uuid): Promise<VersaoDaTabela | undefined> {
    const estado = this.#versoes.get(id);
    return Promise.resolve(estado === undefined ? undefined : VersaoDaTabela.restaurar(estado));
  }

  registrarAprovacao(transacao: TransacaoEmMemoria, versao: VersaoDaTabela): Promise<boolean> {
    if (this.#versoes.get(versao.id)?.status !== 'rascunho') return Promise.resolve(false);
    transacao.aoConfirmar(() => this.#versoes.set(versao.id, versao.estado));
    return Promise.resolve(true);
  }
}
