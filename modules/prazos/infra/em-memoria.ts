import { Prazo, STATUS_RECALCULAVEIS } from '../domain/prazo.js';
import { VersaoDaTabela } from '../domain/tabela.js';

import type { Compromisso, RepositorioDeCompromissos } from '../application/compromissos.js';
import type {
  AlcanceDaAlteracao,
  ContagemDoPainel,
  FiltroDaBuscaDePrazos,
  FiltroDePrazos,
  FiltroDeVersoes,
  RecorteDoPainel,
  RepositorioDePrazos,
  RepositorioDaTabela,
  RepositorioDeTiposDeAto,
  TipoDeAto,
} from '../application/portas.js';
import type { EstadoDoPrazo } from '../domain/prazo.js';
import type { EstadoDaVersao, Ramo } from '../domain/tabela.js';
import type { Instant, LocalDate, TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Mesmo critério do Postgres para o card do dashboard aberto na lista. */
function noRecorte(e: EstadoDoPrazo, recorte: NonNullable<FiltroDePrazos['recorte']>): boolean {
  const aberto = STATUS_RECALCULAVEIS.includes(e.status);
  const v = e.calculo.vencimento;
  switch (recorte.tipo) {
    case 'vence-hoje':
      return aberto && v?.igual(recorte.hoje) === true;
    case 'proximos-7-dias':
      return aberto && v !== null && v.ehDepoisDe(recorte.hoje) && !v.ehDepoisDe(recorte.ate);
    case 'vencidos':
      return e.status === 'vencido' || (aberto && v?.ehAntesDe(recorte.hoje) === true);
    case 'sem-ciencia':
      return aberto && e.statusCiencia === 'pendente';
  }
}

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

  listar(_transacao: TransacaoEmMemoria, filtro: FiltroDePrazos): Promise<Prazo[]> {
    const chave = (e: { calculo: { vencimento: LocalDate | null }; id: string }) =>
      `${e.calculo.vencimento?.paraIso() ?? '9999-12-31'}|${e.id}`;
    const cursor =
      filtro.depoisDe === undefined
        ? undefined
        : chave({ calculo: { vencimento: filtro.depoisDe.vencimento }, id: filtro.depoisDe.id });
    return Promise.resolve(
      [...this.#prazos.values()]
        .filter(
          (e) =>
            (filtro.status === undefined || e.status === filtro.status) &&
            (filtro.processoId === undefined || e.processoId === filtro.processoId) &&
            (filtro.responsavelId === undefined || e.responsavelId === filtro.responsavelId) &&
            (filtro.recorte === undefined || noRecorte(e, filtro.recorte)) &&
            (cursor === undefined || chave(e) > cursor),
        )
        .sort((a, b) => chave(a).localeCompare(chave(b)))
        .slice(0, filtro.limite)
        .map((e) => Prazo.restaurar(e)),
    );
  }

  existeDaPublicacao(_transacao: TransacaoEmMemoria, conteudoId: Uuid): Promise<boolean> {
    return Promise.resolve(
      [...this.#prazos.values()].some((e) => e.publicacaoConteudoId === conteudoId),
    );
  }

  vencidos(_transacao: TransacaoEmMemoria, hoje: LocalDate, limite: number): Promise<Prazo[]> {
    return Promise.resolve(
      this.#vencidos(hoje)
        .slice(0, limite)
        .map((e) => Prazo.restaurar(e)),
    );
  }

  tenantsComVencidos(_transacao: TransacaoEmMemoria, hoje: LocalDate): Promise<Uuid[]> {
    return Promise.resolve([...new Set(this.#vencidos(hoje).map((e) => e.tenantId))].sort());
  }

  contarParaOPainel(
    _transacao: TransacaoEmMemoria,
    hoje: LocalDate,
    ate: LocalDate,
    recorte: RecorteDoPainel,
  ): Promise<ContagemDoPainel> {
    const todos = this.#doRecorte(recorte);
    const abertos = todos.filter((e) => STATUS_RECALCULAVEIS.includes(e.status));
    const vence = (e: EstadoDoPrazo) => e.calculo.vencimento;
    return Promise.resolve({
      vencemHoje: abertos.filter((e) => vence(e)?.igual(hoje) === true).length,
      proximos7Dias: abertos.filter((e) => {
        const v = vence(e);
        return v !== null && v.ehDepoisDe(hoje) && !v.ehDepoisDe(ate);
      }).length,
      vencidosNaoCumpridos: todos.filter(
        (e) =>
          e.status === 'vencido' ||
          (STATUS_RECALCULAVEIS.includes(e.status) && vence(e)?.ehAntesDe(hoje) === true),
      ).length,
      aguardandoConfirmacao: todos.filter((e) => e.status === 'a-confirmar').length,
      semCienciaConfirmada: abertos.filter((e) => e.statusCiencia === 'pendente').length,
    });
  }

  vencimentosPorDia(
    _transacao: TransacaoEmMemoria,
    inicio: LocalDate,
    fim: LocalDate,
    recorte: RecorteDoPainel,
  ): Promise<{ data: LocalDate; quantidade: number }[]> {
    const porDia = new Map<string, { data: LocalDate; quantidade: number }>();
    for (const e of this.#abertosDoRecorte(recorte)) {
      const v = e.calculo.vencimento;
      if (v === null || v.ehAntesDe(inicio) || v.ehDepoisDe(fim)) continue;
      const atual = porDia.get(v.paraIso()) ?? { data: v, quantidade: 0 };
      porDia.set(v.paraIso(), { data: v, quantidade: atual.quantidade + 1 });
    }
    return Promise.resolve([...porDia.values()].sort((a, b) => a.data.comparar(b.data)));
  }

  abertosAPartirDe(
    _transacao: TransacaoEmMemoria,
    hoje: LocalDate,
    recorte: RecorteDoPainel,
    limite: number,
  ): Promise<Prazo[]> {
    return Promise.resolve(
      this.#abertosDoRecorte(recorte)
        .filter((e) => e.calculo.vencimento !== null && !e.calculo.vencimento.ehAntesDe(hoje))
        .sort(
          (a, b) =>
            (a.calculo.vencimento?.comparar(b.calculo.vencimento ?? hoje) ?? 0) ||
            a.id.localeCompare(b.id),
        )
        .slice(0, limite)
        .map((e) => Prazo.restaurar(e)),
    );
  }

  buscarComFiltros(_transacao: TransacaoEmMemoria, f: FiltroDaBuscaDePrazos): Promise<Prazo[]> {
    const data = (e: EstadoDoPrazo) =>
      (f.campoData === 'inicio' ? e.calculo.inicio : e.calculo.vencimento)?.paraIso() ?? null;
    const sinal = f.ordem === 'asc' ? 1 : -1;
    const ordenados = this.#naBusca(f).sort((a, b) => {
      const da = data(a);
      const db = data(b);
      if (da !== db) {
        if (da === null) return 1;
        if (db === null) return -1;
        return da.localeCompare(db) * sinal;
      }
      return a.id.localeCompare(b.id) * sinal;
    });
    const inicio =
      f.depoisDe === undefined ? 0 : ordenados.findIndex((e) => e.id === f.depoisDe) + 1;
    return Promise.resolve(
      ordenados.slice(inicio, inicio + f.limite).map((e) => Prazo.restaurar(e)),
    );
  }

  contarNaBusca(_transacao: TransacaoEmMemoria, f: FiltroDaBuscaDePrazos, teto: number) {
    return Promise.resolve(Math.min(this.#naBusca(f).length, teto));
  }

  #naBusca(f: FiltroDaBuscaDePrazos): EstadoDoPrazo[] {
    const tem = <T>(lista: readonly T[] | undefined, valor: T) =>
      lista === undefined || lista.includes(valor);
    return [...this.#prazos.values()].filter((e) => {
      const d = f.campoData === 'inicio' ? e.calculo.inicio : e.calculo.vencimento;
      const noPeriodo =
        (f.de === undefined || (d !== null && !d.ehAntesDe(f.de))) &&
        (f.ate === undefined || (d !== null && !d.ehDepoisDe(f.ate)));
      return (
        tem(f.processoIds, e.processoId) &&
        (f.conteudoIds === undefined ||
          (e.publicacaoConteudoId !== null && f.conteudoIds.includes(e.publicacaoConteudoId))) &&
        (f.responsavelIds === undefined ||
          (e.responsavelId !== null && f.responsavelIds.includes(e.responsavelId))) &&
        tem(f.tiposAto, e.tipoAto) &&
        tem(f.status, e.status) &&
        tem(f.statusCiencia, e.statusCiencia) &&
        (f.ramo === undefined || e.ramo === f.ramo) &&
        tem(f.origem, e.origem) &&
        noPeriodo
      );
    });
  }

  #doRecorte(recorte: RecorteDoPainel): EstadoDoPrazo[] {
    return [...this.#prazos.values()].filter(
      (e) =>
        (recorte.responsavelId === undefined || e.responsavelId === recorte.responsavelId) &&
        (recorte.tribunal === undefined || e.jurisdicao.tribunal === recorte.tribunal),
    );
  }

  #abertosDoRecorte(recorte: RecorteDoPainel): EstadoDoPrazo[] {
    return this.#doRecorte(recorte).filter((e) => STATUS_RECALCULAVEIS.includes(e.status));
  }

  #vencidos(hoje: LocalDate): EstadoDoPrazo[] {
    return [...this.#prazos.values()]
      .filter(
        (e) =>
          STATUS_RECALCULAVEIS.includes(e.status) && e.calculo.vencimento?.ehAntesDe(hoje) === true,
      )
      .sort((a, b) => a.id.localeCompare(b.id));
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

/** Compromissos em memória, com a semântica do Postgres. Só para testes. */
export class CompromissosEmMemoria implements RepositorioDeCompromissos<TransacaoEmMemoria> {
  readonly #itens = new Map<string, Compromisso>();

  inserir(_tx: TransacaoEmMemoria, c: Compromisso): Promise<void> {
    this.#itens.set(c.id, c);
    return Promise.resolve();
  }

  buscar(_tx: TransacaoEmMemoria, id: Uuid): Promise<Compromisso | undefined> {
    return Promise.resolve(this.#itens.get(id));
  }

  cancelar(_tx: TransacaoEmMemoria, c: Compromisso): Promise<boolean> {
    if (this.#itens.get(c.id)?.canceladoEm !== null) return Promise.resolve(false);
    this.#itens.set(c.id, c);
    return Promise.resolve(true);
  }

  doPeriodo(_tx: TransacaoEmMemoria, de: Instant, ate: Instant, limite: number) {
    return Promise.resolve(
      [...this.#itens.values()]
        .filter(
          (c) => c.canceladoEm === null && !c.dataHora.ehAntesDe(de) && !c.dataHora.ehDepoisDe(ate),
        )
        .sort((a, b) => a.dataHora.comparar(b.dataHora) || a.id.localeCompare(b.id))
        .slice(0, limite),
    );
  }
}
