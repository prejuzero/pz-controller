import type { CampoParaRecifrar, CamposSensiveis } from '../application/recifra.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/** Campos sensíveis do cadastro (advogado.cpf, cliente.documento) para a recifra (ADR-021). */
export class CamposSensiveisPostgres implements CamposSensiveis<Transacao> {
  async tenants(tx: Transacao): Promise<Uuid[]> {
    const [advogados, clientes] = await Promise.all([
      tx.advogado.findMany({ distinct: ['tenantId'], select: { tenantId: true } }),
      tx.cliente.findMany({
        where: { OR: [{ documento: { not: null } }, { documentoCifrado: { not: null } }] },
        distinct: ['tenantId'],
        select: { tenantId: true },
      }),
    ]);
    return [...new Set([...advogados, ...clientes].map((l) => l.tenantId as Uuid))];
  }

  async lote(tx: Transacao, depoisDe: Uuid | null, limite: number): Promise<CampoParaRecifrar[]> {
    const apos = depoisDe === null ? {} : { id: { gt: depoisDe } };
    const [advogados, clientes] = await Promise.all([
      tx.advogado.findMany({
        where: apos,
        orderBy: { id: 'asc' },
        take: limite,
        select: { id: true, cpf: true, cpfCifrado: true },
      }),
      tx.cliente.findMany({
        where: { ...apos, OR: [{ documento: { not: null } }, { documentoCifrado: { not: null } }] },
        orderBy: { id: 'asc' },
        take: limite,
        select: { id: true, documento: true, documentoCifrado: true },
      }),
    ]);
    // Um cursor só para as duas tabelas: ids UUIDv7 em ordem; o lote leva os `limite` menores.
    return [
      ...advogados.map((a) => ({
        tabela: 'advogado' as const,
        id: a.id as Uuid,
        claro: a.cpf,
        cifrado: a.cpfCifrado,
      })),
      ...clientes.map((c) => ({
        tabela: 'cliente' as const,
        id: c.id as Uuid,
        claro: c.documento,
        cifrado: c.documentoCifrado,
      })),
    ]
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limite);
  }

  async gravar(
    tx: Transacao,
    c: CampoParaRecifrar,
    novo: { cifrado: string | null; indice: string | null },
  ): Promise<void> {
    if (c.tabela === 'advogado') {
      await tx.advogado.update({
        where: { id: c.id },
        data: { cpf: null, cpfCifrado: novo.cifrado, cpfIndice: novo.indice },
      });
    } else {
      await tx.cliente.update({
        where: { id: c.id },
        data: { documento: null, documentoCifrado: novo.cifrado },
      });
    }
  }
}
