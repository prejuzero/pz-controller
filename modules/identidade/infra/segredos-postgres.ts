import type { SegredoParaRecifrar, SegredosParaRecifrar } from '../application/recifra.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/** Segredos do 2FA (usuario.totp_segredo_cifrado) para a recifra (ADR-021). */
export class SegredosDoSegundoFatorPostgres implements SegredosParaRecifrar<Transacao> {
  async tenants(tx: Transacao): Promise<Uuid[]> {
    const linhas = await tx.usuario.findMany({
      where: { totpSegredoCifrado: { not: null } },
      distinct: ['tenantId'],
      select: { tenantId: true },
    });
    return linhas.map((l) => l.tenantId as Uuid);
  }

  async lote(tx: Transacao, depoisDe: Uuid | null, limite: number): Promise<SegredoParaRecifrar[]> {
    const linhas = await tx.usuario.findMany({
      where: {
        totpSegredoCifrado: { not: null },
        ...(depoisDe === null ? {} : { id: { gt: depoisDe } }),
      },
      orderBy: { id: 'asc' },
      take: limite,
      select: { id: true, totpSegredoCifrado: true },
    });
    return linhas.flatMap((l) =>
      l.totpSegredoCifrado === null
        ? []
        : [{ usuarioId: l.id as Uuid, cifrado: l.totpSegredoCifrado }],
    );
  }

  async trocar(tx: Transacao, usuarioId: Uuid, antigo: string, novo: string): Promise<boolean> {
    const { count } = await tx.usuario.updateMany({
      where: { id: usuarioId, totpSegredoCifrado: antigo },
      data: { totpSegredoCifrado: novo },
    });
    return count === 1;
  }
}
