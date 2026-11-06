import type { CampoParaRecifrar, CamposSensiveis } from '../application/recifra.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/** Campos sensíveis cifrados do cadastro (CPF do advogado, documento do cliente; ADR-021). */
export class CamposSensiveisPostgres implements CamposSensiveis<Transacao> {
  async tenants(tx: Transacao): Promise<Uuid[]> {
    const [advogados, clientes] = await Promise.all([
      tx.advogado.findMany({ distinct: ['tenantId'], select: { tenantId: true } }),
      tx.cliente.findMany({
        where: { documentoCifrado: { not: null } },
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
        select: { id: true, cpfCifrado: true },
      }),
      tx.cliente.findMany({
        where: { ...apos, documentoCifrado: { not: null } },
        orderBy: { id: 'asc' },
        take: limite,
        select: { id: true, documentoCifrado: true },
      }),
    ]);
    // Um cursor só para as duas tabelas: ids UUIDv7 em ordem; o lote leva os `limite` menores.
    return [
      ...advogados.map((a) => ({
        tabela: 'advogado' as const,
        id: a.id as Uuid,
        cifrado: a.cpfCifrado,
      })),
      ...clientes.flatMap((c) =>
        c.documentoCifrado === null
          ? []
          : [{ tabela: 'cliente' as const, id: c.id as Uuid, cifrado: c.documentoCifrado }],
      ),
    ]
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limite);
  }

  async gravar(
    tx: Transacao,
    c: CampoParaRecifrar,
    novo: { cifrado: string; indice: string | null },
  ): Promise<void> {
    if (c.tabela === 'advogado') {
      await tx.advogado.update({
        where: { id: c.id },
        data: {
          cpfCifrado: novo.cifrado,
          ...(novo.indice === null ? {} : { cpfIndice: novo.indice }),
        },
      });
    } else {
      await tx.cliente.update({ where: { id: c.id }, data: { documentoCifrado: novo.cifrado } });
    }
  }
}
