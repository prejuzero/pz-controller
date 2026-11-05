import { Processo } from '../domain/processo.js';

import type {
  ProtecaoDeCampos,
  FiltroDeProcessos,
  FiltroDeProcessosNaBusca,
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
  conferenciaACadaDias: linha.conferenciaACadaDias,
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
    const {
      id,
      orgao,
      comarca,
      sigiloso,
      cobertura,
      motivoCobertura,
      clienteId,
      conferenciaACadaDias,
    } = processo.estado;
    await tx.processo.update({
      where: { id },
      data: {
        orgao,
        comarca,
        sigiloso,
        cobertura,
        motivoCobertura,
        clienteId,
        conferenciaACadaDias,
      },
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

  async idsNoFiltro(tx: Transacao, f: FiltroDeProcessosNaBusca, limite: number): Promise<Uuid[]> {
    const linhas = await tx.processo.findMany({
      where: {
        ...(f.numeroCnj === undefined ? {} : { numeroCnj: { contains: f.numeroCnj } }),
        ...(f.clienteId === undefined ? {} : { clienteId: f.clienteId }),
        ...(f.tribunal === undefined ? {} : { tribunal: f.tribunal }),
        ...(f.orgao === undefined ? {} : { orgao: { contains: f.orgao, mode: 'insensitive' } }),
        ...(f.comarca === undefined ? {} : { comarca: { equals: f.comarca, mode: 'insensitive' } }),
      },
      select: { id: true },
      take: limite,
    });
    return linhas.map((l) => l.id as Uuid);
  }

  contar(
    tx: Transacao,
    filtro: Pick<FiltroDeProcessos, 'tribunal' | 'clienteId'>,
  ): Promise<number> {
    return tx.processo.count({
      where: {
        ...(filtro.tribunal === undefined ? {} : { tribunal: filtro.tribunal }),
        ...(filtro.clienteId === undefined ? {} : { clienteId: filtro.clienteId }),
      },
    });
  }
}

/** Documento da linha: o cifrado (atual) ou o legado em claro, até a recifra. */
export function documentoDe(
  linha: { documento: string | null; documentoCifrado: string | null },
  protecao: ProtecaoDeCampos,
): string | null {
  return linha.documentoCifrado === null
    ? linha.documento
    : protecao.decifrar(linha.documentoCifrado);
}

/** Clientes no PostgreSQL (HU12), no tenant da transação (RLS); documento só cifrado (HU37). */
export class ClientesPostgres implements RepositorioDeClientes<Transacao> {
  constructor(private readonly protecao: ProtecaoDeCampos) {}

  #clienteDe(linha: {
    id: string;
    tenantId: string;
    nome: string;
    documento: string | null;
    documentoCifrado: string | null;
  }): Cliente {
    return {
      id: linha.id as Uuid,
      tenantId: linha.tenantId as Uuid,
      nome: linha.nome,
      documento: documentoDe(linha, this.protecao),
    };
  }

  #documento(documento: string | null) {
    return {
      documento: null,
      documentoCifrado: documento === null ? null : this.protecao.cifrar(documento),
    };
  }

  async inserir(tx: Transacao, cliente: Cliente): Promise<void> {
    await tx.cliente.create({
      data: {
        id: cliente.id,
        tenantId: cliente.tenantId,
        nome: cliente.nome,
        ...this.#documento(cliente.documento),
      },
    });
  }

  async buscar(tx: Transacao, id: Uuid): Promise<Cliente | undefined> {
    const linha = await tx.cliente.findUnique({ where: { id } });
    return linha === null ? undefined : this.#clienteDe(linha);
  }

  async salvar(tx: Transacao, cliente: Cliente): Promise<void> {
    await tx.cliente.update({
      where: { id: cliente.id },
      data: { nome: cliente.nome, ...this.#documento(cliente.documento) },
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
    return linhas.map((l) => this.#clienteDe(l));
  }
}
