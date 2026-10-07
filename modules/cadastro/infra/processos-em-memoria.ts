import { Processo } from '../domain/processo.js';

import type {
  FiltroDeProcessos,
  Paginacao,
  RepositorioDeClientes,
  RepositorioDeProcessos,
} from '../application/portas.js';
import type { Cliente } from '../domain/cliente.js';
import type { EstadoDoProcesso } from '../domain/processo.js';
import type { Clock, TransacaoEmMemoria, Uuid } from '@pz/kernel';

const pagina = <T extends { id: Uuid }>(itens: T[], { apos, limite }: Paginacao) =>
  itens
    .filter((item) => apos === undefined || item.id < apos)
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .slice(0, limite);

/**
 * Processos e clientes em memória com a semântica do Postgres (um tenant só: o RLS fica para o
 * teste de integração): número único, mudanças só na confirmação da transação. Só para testes.
 */
export class ProcessosEmMemoria implements RepositorioDeProcessos<TransacaoEmMemoria> {
  readonly linhas = new Map<Uuid, EstadoDoProcesso>();
  /**
   * Números inseridos por transações ainda abertas: no Postgres a inserção concorrente espera a
   * outra confirmar e então enxerga a linha; aqui a busca já a enxerga.
   */
  readonly #emInsercao = new Map<string, EstadoDoProcesso>();

  constructor(private readonly relogio: Clock) {}

  inserir(tx: TransacaoEmMemoria, processo: Processo): Promise<boolean> {
    const e = processo.estado;
    const repetido = [...this.linhas.values()].some((p) => p.numeroCnj === e.numeroCnj);
    if (repetido || this.#emInsercao.has(e.numeroCnj)) return Promise.resolve(false);
    this.#emInsercao.set(e.numeroCnj, e);
    tx.aoConfirmar(() => {
      this.#emInsercao.delete(e.numeroCnj);
      this.linhas.set(e.id, e);
    });
    return Promise.resolve(true);
  }

  buscar(_tx: TransacaoEmMemoria, id: Uuid): Promise<Processo | undefined> {
    const estado = this.linhas.get(id);
    return Promise.resolve(estado && Processo.restaurar(estado, this.relogio));
  }

  buscarPorNumero(_tx: TransacaoEmMemoria, numeroCnj: string): Promise<Processo | undefined> {
    const estado =
      [...this.linhas.values()].find((p) => p.numeroCnj === numeroCnj) ??
      this.#emInsercao.get(numeroCnj);
    return Promise.resolve(estado && Processo.restaurar(estado, this.relogio));
  }

  salvar(tx: TransacaoEmMemoria, processo: Processo): Promise<void> {
    tx.aoConfirmar(() => this.linhas.set(processo.id, processo.estado));
    return Promise.resolve();
  }

  listar(
    _tx: TransacaoEmMemoria,
    filtro: FiltroDeProcessos,
    paginacao: Paginacao,
  ): Promise<EstadoDoProcesso[]> {
    const filtrados = [...this.linhas.values()].filter(
      (p) =>
        (filtro.numero === undefined || p.numeroCnj.includes(filtro.numero)) &&
        (filtro.clienteId === undefined || p.clienteId === filtro.clienteId) &&
        (filtro.tribunal === undefined || p.tribunal === filtro.tribunal) &&
        (filtro.cobertura === undefined || p.cobertura === filtro.cobertura) &&
        (filtro.sigiloso === undefined || p.sigiloso === filtro.sigiloso),
    );
    return Promise.resolve(pagina(filtrados, paginacao));
  }
}

export class ClientesEmMemoria implements RepositorioDeClientes<TransacaoEmMemoria> {
  readonly linhas = new Map<Uuid, Cliente>();

  constructor(private readonly processos: ProcessosEmMemoria) {}

  inserir(tx: TransacaoEmMemoria, cliente: Cliente): Promise<void> {
    tx.aoConfirmar(() => this.linhas.set(cliente.id, cliente));
    return Promise.resolve();
  }

  buscar(_tx: TransacaoEmMemoria, id: Uuid): Promise<Cliente | undefined> {
    return Promise.resolve(this.linhas.get(id));
  }

  salvar(tx: TransacaoEmMemoria, cliente: Cliente): Promise<void> {
    return this.inserir(tx, cliente);
  }

  remover(tx: TransacaoEmMemoria, id: Uuid): Promise<'ok' | 'nao-encontrado' | 'com-processos'> {
    if (!this.linhas.has(id)) return Promise.resolve('nao-encontrado');
    if ([...this.processos.linhas.values()].some((p) => p.clienteId === id))
      return Promise.resolve('com-processos');
    tx.aoConfirmar(() => this.linhas.delete(id));
    return Promise.resolve('ok');
  }

  listar(_tx: TransacaoEmMemoria, filtro: { nome?: string }, paginacao: Paginacao) {
    const nome = filtro.nome?.toLowerCase();
    const filtrados = [...this.linhas.values()].filter(
      (c) => nome === undefined || c.nome.toLowerCase().includes(nome),
    );
    return Promise.resolve(pagina(filtrados, paginacao));
  }
}
