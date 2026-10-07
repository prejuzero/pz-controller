import { Processo } from '../domain/processo.js';

import type {
  FiltroDeProcessos,
  Paginacao,
  RepositorioDeClientes,
  RepositorioDeProcessos,
} from '../application/portas.js';
import type { Cliente } from '../domain/cliente.js';
import type { EstadoDoProcesso } from '../domain/processo.js';
import type { Transacao } from '@pz/db';
import type { Clock, Ramo, Uuid } from '@pz/kernel';

type LinhaDoProcesso = NonNullable<Awaited<ReturnType<Transacao['processo']['findFirst']>>>;

const estadoDe = (linha: LinhaDoProcesso): EstadoDoProcesso => ({
  id: linha.id as Uuid,
  tenantId: linha.tenantId as Uuid,
  numeroCnj: linha.numeroCnj,
  tribunal: linha.tribunal,
  ramo: linha.ramo as Ramo | null,
  orgao: linha.orgao,
  comarca: linha.comarca,
  sigiloso: linha.sigiloso,
  cobertura: linha.cobertura,
  motivoCobertura: linha.motivoCobertura,
  clienteId: linha.clienteId as Uuid | null,
});

const ordem = [{ id: 'desc' as const }];
const depoisDe = (apos: Uuid | undefined) => (apos === undefined ? {} : { id: { lt: apos } });

/**
 * Processos no PostgreSQL (HU12), no tenant da transação (RLS). `skipDuplicates` vira
 * `ON CONFLICT DO NOTHING`: o número repetido no tenant não aborta a transação, e a inserção
 * concorrente espera a outra transação terminar (base da idempotência de obterOuCriarProcesso).
 */
export class ProcessosPostgres implements RepositorioDeProcessos<Transacao> {
  constructor(private readonly relogio: Clock) {}

  async inserir(tx: Transacao, processo: Processo): Promise<boolean> {
    const { count } = await tx.processo.createMany({
      data: [{ ...processo.estado }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async buscar(tx: Transacao, id: Uuid): Promise<Processo | undefined> {
    const linha = await tx.processo.findUnique({ where: { id } });
    return linha === null ? undefined : Processo.restaurar(estadoDe(linha), this.relogio);
  }

  async buscarPorNumero(tx: Transacao, numeroCnj: string): Promise<Processo | undefined> {
    // O RLS limita ao tenant da transação; o número é único dentro dele.
    const linha = await tx.processo.findFirst({ where: { numeroCnj } });
    return linha === null ? undefined : Processo.restaurar(estadoDe(linha), this.relogio);
  }

  async salvar(tx: Transacao, processo: Processo): Promise<void> {
    const { id, orgao, comarca, sigiloso, cobertura, motivoCobertura, clienteId } = processo.estado;
    await tx.processo.update({
      where: { id },
      data: { orgao, comarca, sigiloso, cobertura, motivoCobertura, clienteId },
    });
  }

  async listar(
    tx: Transacao,
    filtro: FiltroDeProcessos,
    { apos, limite }: Paginacao,
  ): Promise<EstadoDoProcesso[]> {
    const linhas = await tx.processo.findMany({
      where: {
        ...depoisDe(apos),
        ...(filtro.numero === undefined ? {} : { numeroCnj: { contains: filtro.numero } }),
        ...(filtro.clienteId === undefined ? {} : { clienteId: filtro.clienteId }),
        ...(filtro.tribunal === undefined ? {} : { tribunal: filtro.tribunal }),
        ...(filtro.cobertura === undefined ? {} : { cobertura: filtro.cobertura }),
        ...(filtro.sigiloso === undefined ? {} : { sigiloso: filtro.sigiloso }),
      },
      orderBy: ordem,
      take: limite,
    });
    return linhas.map(estadoDe);
  }
}

const clienteDe = (linha: {
  id: string;
  tenantId: string;
  nome: string;
  documento: string | null;
}) =>
  ({
    id: linha.id as Uuid,
    tenantId: linha.tenantId as Uuid,
    nome: linha.nome,
    documento: linha.documento,
  }) satisfies Cliente;

/** Clientes no PostgreSQL (HU12), no tenant da transação (RLS). */
export class ClientesPostgres implements RepositorioDeClientes<Transacao> {
  async inserir(tx: Transacao, cliente: Cliente): Promise<void> {
    await tx.cliente.create({ data: { ...cliente } });
  }

  async buscar(tx: Transacao, id: Uuid): Promise<Cliente | undefined> {
    const linha = await tx.cliente.findUnique({ where: { id } });
    return linha === null ? undefined : clienteDe(linha);
  }

  async salvar(tx: Transacao, cliente: Cliente): Promise<void> {
    await tx.cliente.update({
      where: { id: cliente.id },
      data: { nome: cliente.nome, documento: cliente.documento },
    });
  }

  async remover(tx: Transacao, id: Uuid): Promise<'ok' | 'nao-encontrado' | 'com-processos'> {
    const { count } = await tx.cliente.deleteMany({ where: { id, processos: { none: {} } } });
    if (count === 1) return 'ok';
    return (await tx.cliente.count({ where: { id } })) === 0 ? 'nao-encontrado' : 'com-processos';
  }

  async listar(tx: Transacao, filtro: { nome?: string }, { apos, limite }: Paginacao) {
    const linhas = await tx.cliente.findMany({
      where: {
        ...depoisDe(apos),
        ...(filtro.nome === undefined
          ? {}
          : { nome: { contains: filtro.nome, mode: 'insensitive' as const } }),
      },
      orderBy: ordem,
      take: limite,
    });
    return linhas.map(clienteDe);
  }
}
