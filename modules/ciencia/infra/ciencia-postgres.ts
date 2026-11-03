import { Instant } from '@pz/kernel';

import type {
  CienciaDoPrazo,
  RepositorioDeCiencia,
  TokenRegistrado,
} from '../application/ciencia.js';
import type { CanalDaConfirmacao, EstadoDaCiencia } from '../domain/estado.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

const instante = (d: Date | null) => (d === null ? undefined : Instant.deEpochMs(d.getTime()));
const paraBanco = (e: EstadoDaCiencia) => e.replaceAll('-', '_') as 'nao_enviado';
const doBanco = (e: string) => e.replaceAll('_', '-') as EstadoDaCiencia;

/** Tokens (só o hash) e estado da ciência no PostgreSQL, no tenant da transação (RLS). */
export class CienciaPostgres implements RepositorioDeCiencia<Transacao> {
  async tokenPorHash(tx: Transacao, hash: string): Promise<TokenRegistrado | undefined> {
    const l = await tx.tokenCiencia.findUnique({ where: { hashToken: hash } });
    if (l === null) return undefined;
    const usado = instante(l.usadoEm);
    const revogado = instante(l.revogadoEm);
    return {
      id: l.id as Uuid,
      tenantId: l.tenantId as Uuid,
      prazoId: l.prazoId as Uuid,
      usuarioId: l.usuarioId as Uuid,
      expiraEm: Instant.deEpochMs(l.expiraEm.getTime()),
      ...(usado === undefined ? {} : { usadoEm: usado }),
      ...(revogado === undefined ? {} : { revogadoEm: revogado }),
    };
  }

  async revogarAtivos(tx: Transacao, prazoId: Uuid, usuarioId: Uuid, agora: Instant) {
    await tx.tokenCiencia.updateMany({
      where: { prazoId, usuarioId, usadoEm: null, revogadoEm: null },
      data: { revogadoEm: new Date(agora.epochMs) },
    });
  }

  async inserirToken(tx: Transacao, t: TokenRegistrado, hash: string): Promise<void> {
    await tx.tokenCiencia.create({
      data: {
        id: t.id,
        tenantId: t.tenantId,
        prazoId: t.prazoId,
        usuarioId: t.usuarioId,
        hashToken: hash,
        expiraEm: new Date(t.expiraEm.epochMs),
      },
    });
  }

  async usarToken(tx: Transacao, id: Uuid, agora: Instant, ip: string): Promise<boolean> {
    const { count } = await tx.tokenCiencia.updateMany({
      where: { id, usadoEm: null, revogadoEm: null },
      data: { usadoEm: new Date(agora.epochMs), usadoIp: ip },
    });
    return count === 1;
  }

  /**
   * Confirmações dos prazos (controle de ciência, HU34): quando e por qual canal, gravadas na
   * mesma transação da trilha. Prazo sem confirmação fica de fora do mapa.
   */
  async confirmacoes(
    tx: Transacao,
    prazoIds: readonly Uuid[],
  ): Promise<ReadonlyMap<Uuid, { confirmadaEm: Instant; canal: string }>> {
    if (prazoIds.length === 0) return new Map();
    const linhas = await tx.cienciaPrazo.findMany({
      where: { prazoId: { in: [...prazoIds] }, confirmadaEm: { not: null } },
      select: { prazoId: true, confirmadaEm: true, canal: true },
    });
    return new Map(
      linhas.flatMap((l) =>
        l.confirmadaEm === null
          ? []
          : [
              [
                l.prazoId as Uuid,
                { confirmadaEm: Instant.deEpochMs(l.confirmadaEm.getTime()), canal: l.canal ?? '' },
              ] as const,
            ],
      ),
    );
  }

  async ciencia(tx: Transacao, prazoId: Uuid): Promise<CienciaDoPrazo | undefined> {
    const l = await tx.cienciaPrazo.findUnique({ where: { prazoId } });
    if (l === null) return undefined;
    return {
      estado: doBanco(l.estado),
      ...(l.confirmadaEm === null || l.confirmadaPor === null
        ? {}
        : {
            confirmacao: {
              usuarioId: l.confirmadaPor as Uuid,
              canal: (l.canal ?? 'portal') as CanalDaConfirmacao,
              em: Instant.deEpochMs(l.confirmadaEm.getTime()),
              ip: l.ip ?? '',
              userAgent: l.userAgent ?? '',
            },
          }),
    };
  }

  async gravar(tx: Transacao, tenantId: Uuid, prazoId: Uuid, c: CienciaDoPrazo): Promise<void> {
    const confirmacao =
      c.confirmacao === undefined
        ? {}
        : {
            confirmadaPor: c.confirmacao.usuarioId,
            confirmadaEm: new Date(c.confirmacao.em.epochMs),
            canal: c.confirmacao.canal,
            ip: c.confirmacao.ip,
            userAgent: c.confirmacao.userAgent,
          };
    await tx.cienciaPrazo.upsert({
      where: { prazoId },
      create: { tenantId, prazoId, estado: paraBanco(c.estado), ...confirmacao },
      update: { estado: paraBanco(c.estado), ...confirmacao },
    });
  }
}
