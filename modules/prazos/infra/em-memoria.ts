import { Prazo, STATUS_RECALCULAVEIS } from '../domain/prazo.js';
import { VersaoDaTabela } from '../domain/tabela.js';

import type {
  AlcanceDaAlteracao,
  FiltroDeVersoes,
  RepositorioDePrazos,
  RepositorioDaTabela,
  RepositorioDeTiposDeAto,
  TipoDeAto,
} from '../application/portas.js';
import type { EstadoDoPrazo } from '../domain/prazo.js';
import type { EstadoDaVersao, Ramo } from '../domain/tabela.js';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Repositórios em memória da tabela de prazos, com a semântica do Postgres. Só para testes. */
export class TabelaEmMemoria
  implements RepositorioDaTabela<TransacaoEmMemoria>, RepositorioDeTiposDeAto<TransacaoEmMemoria>
{
  readonly #tipos = new Map<string, TipoDeAto>();
  readonly #versoes = new Map<string, EstadoDaVersao>();
  /** Tipos inseridos na transação em curso: visíveis nela, como no Postgres. */
  readonly #tiposPendentes = new WeakMap<TransacaoEmMemoria, Set<string>>();

  existe(_transacao: TransacaoEmMemoria, codigo: string): Promise<boolean> {
    return Promise.resolve(this.#tipos.has(codigo));
  }

  inserir(transacao: TransacaoEmMemoria, item: TipoDeAto | VersaoDaTabela): Promise<boolean> {
    if (item instanceof VersaoDaTabela) {
      const e = item.estado;
      const repetida = [...this.#versoes.values()].some(
        (v) => v.tipoAto === e.tipoAto && v.ramo === e.ramo && v.versao === e.versao,
      );
      const tipoVisivel =
        this.#tipos.has(e.tipoAto) || this.#tiposPendentes.get(transacao)?.has(e.tipoAto) === true;
      if (repetida || !tipoVisivel) return Promise.resolve(false);
      transacao.aoConfirmar(() => this.#versoes.set(e.id, e));
      return Promise.resolve(true);
    }
    if (this.#tipos.has(item.codigo)) return Promise.resolve(false);
    const pendentes = this.#tiposPendentes.get(transacao) ?? new Set<string>();
    pendentes.add(item.codigo);
    this.#tiposPendentes.set(transacao, pendentes);
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

/** Prazos em memória, com o filtro de alcance do Postgres. Só para testes. */
export class PrazosEmMemoria implements RepositorioDePrazos<TransacaoEmMemoria> {
  readonly #prazos = new Map<string, EstadoDoPrazo>();

  inserir(_transacao: TransacaoEmMemoria, prazo: Prazo): Promise<void> {
    if (this.#prazos.has(prazo.id)) return Promise.reject(new Error('prazo repetido'));
    this.#prazos.set(prazo.id, prazo.estado);
    return Promise.resolve();
  }

  buscar(_transacao: TransacaoEmMemoria, id: Uuid): Promise<Prazo | undefined> {
    const estado = this.#prazos.get(id);
    return Promise.resolve(estado === undefined ? undefined : Prazo.restaurar(estado));
  }

  atualizar(_transacao: TransacaoEmMemoria, prazo: Prazo, versaoLida: number): Promise<boolean> {
    const atual = this.#prazos.get(prazo.id);
    if (atual?.versaoOtimista !== versaoLida) return Promise.resolve(false);
    this.#prazos.set(prazo.id, prazo.estado);
    return Promise.resolve(true);
  }

  /** Simula outra gravação no meio (concorrência otimista). */
  alterarVersao(id: Uuid): void {
    const atual = this.#prazos.get(id);
    if (atual !== undefined)
      this.#prazos.set(id, { ...atual, versaoOtimista: atual.versaoOtimista + 1 });
  }

  afetados(
    _transacao: TransacaoEmMemoria,
    alcance: AlcanceDaAlteracao,
    depoisDe: Uuid | null,
    limite: number,
  ): Promise<Prazo[]> {
    return Promise.resolve(
      this.#alcancados(alcance)
        .filter((e) => depoisDe === null || e.id > depoisDe)
        .slice(0, limite)
        .map((e) => Prazo.restaurar(e)),
    );
  }

  tenantsAfetados(_transacao: TransacaoEmMemoria, alcance: AlcanceDaAlteracao): Promise<Uuid[]> {
    return Promise.resolve([...new Set(this.#alcancados(alcance).map((e) => e.tenantId))].sort());
  }

  #alcancados(alcance: AlcanceDaAlteracao): EstadoDoPrazo[] {
    return [...this.#prazos.values()]
      .filter((e) => {
        const referencia = (e.entrada as { dataDeReferencia?: string } | null)?.dataDeReferencia;
        const j = e.jurisdicao;
        const vencimento = e.calculo.vencimento;
        return (
          STATUS_RECALCULAVEIS.includes(e.status) &&
          !e.vencimentoManual &&
          referencia !== undefined &&
          referencia <= alcance.fim.paraIso() &&
          !vencimento?.ehAntesDe(alcance.inicio) &&
          (alcance.abrangencia === 'nacional' ||
            (alcance.abrangencia === 'uf' && j.uf === alcance.uf) ||
            (alcance.abrangencia === 'tribunal' && j.tribunal === alcance.tribunal) ||
            (alcance.abrangencia === 'comarca' &&
              j.tribunal === alcance.tribunal &&
              j.comarca === alcance.comarca))
        );
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
