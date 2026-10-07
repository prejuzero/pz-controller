import { Instant } from '@pz/kernel';

import { ConsentimentoCanal } from '../domain/consentimento.js';

import type {
  DestinoPushNovo,
  RepositorioDeConsentimentos,
  RepositorioDeDestinosPush,
} from '../application/portas.js';
import type { CanalComConsentimento, OrigemDoConsentimento } from '../domain/consentimento.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

type LinhaConsentimento = NonNullable<
  Awaited<ReturnType<Transacao['consentimentoCanal']['findUnique']>>
>;

const restaurar = (l: LinhaConsentimento): ConsentimentoCanal =>
  ConsentimentoCanal.restaurar({
    id: l.id as Uuid,
    tenantId: l.tenantId as Uuid,
    usuarioId: l.usuarioId as Uuid,
    canal: l.canal as CanalComConsentimento,
    destino: l.destino,
    concedidoEm: Instant.deEpochMs(l.concedidoEm.getTime()),
    ...(l.revogadoEm === null ? {} : { revogadoEm: Instant.deEpochMs(l.revogadoEm.getTime()) }),
    origem: l.origem as OrigemDoConsentimento,
  });

/** Consentimentos no PostgreSQL (HU30), no tenant da transação (RLS). */
export class ConsentimentosPostgres implements RepositorioDeConsentimentos<Transacao> {
  async ativos(tx: Transacao, usuarioId: Uuid): Promise<ConsentimentoCanal[]> {
    const linhas = await tx.consentimentoCanal.findMany({
      where: { usuarioId, revogadoEm: null },
      orderBy: { concedidoEm: 'asc' },
    });
    return linhas.map(restaurar);
  }

  async buscar(tx: Transacao, id: Uuid): Promise<ConsentimentoCanal | undefined> {
    const l = await tx.consentimentoCanal.findUnique({ where: { id } });
    return l === null ? undefined : restaurar(l);
  }

  async inserir(tx: Transacao, consentimento: ConsentimentoCanal): Promise<boolean> {
    const e = consentimento.estado;
    // ON CONFLICT DO NOTHING no índice parcial dos ativos: o concorrente não aborta a transação.
    const { count } = await tx.consentimentoCanal.createMany({
      data: [
        {
          id: e.id,
          tenantId: e.tenantId,
          usuarioId: e.usuarioId,
          canal: e.canal,
          destino: e.destino,
          concedidoEm: new Date(e.concedidoEm.epochMs),
          origem: e.origem,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async registrarRevogacao(tx: Transacao, consentimento: ConsentimentoCanal): Promise<void> {
    const { id, revogadoEm } = consentimento.estado;
    await tx.consentimentoCanal.update({
      where: { id },
      data: { revogadoEm: revogadoEm === undefined ? null : new Date(revogadoEm.epochMs) },
    });
  }

  async enderecos(
    tx: Transacao,
    usuarioId: Uuid,
    canal: CanalComConsentimento,
  ): Promise<readonly string[]> {
    const consentidos = await tx.consentimentoCanal.findMany({
      where: { usuarioId, canal, revogadoEm: null },
      select: { destino: true },
    });
    const destinos = consentidos.map((c) => c.destino);
    if (canal !== 'push') return destinos;
    if (destinos.length === 0) return [];
    const push = await tx.destinoPush.findMany({
      where: { usuarioId, ativo: true, dispositivoId: { in: destinos } },
      select: { token: true },
    });
    return push.map((p) => p.token);
  }
}

/** Destinos de push no PostgreSQL (HU30), um por dispositivo, no tenant da transação (RLS). */
export class DestinosPushPostgres implements RepositorioDeDestinosPush<Transacao> {
  async gravar(tx: Transacao, d: DestinoPushNovo, id: Uuid): Promise<Uuid> {
    const { id: gravado } = await tx.destinoPush.upsert({
      where: { dispositivoId: d.dispositivoId },
      create: { id, ...d, ativo: true },
      update: { usuarioId: d.usuarioId, plataforma: d.plataforma, token: d.token, ativo: true },
      select: { id: true },
    });
    return gravado as Uuid;
  }

  async desativar(tx: Transacao, usuarioId: Uuid, dispositivoId: Uuid): Promise<Uuid | undefined> {
    const atual = await tx.destinoPush.findFirst({
      where: { usuarioId, dispositivoId, ativo: true },
      select: { id: true },
    });
    if (atual === null) return undefined;
    await tx.destinoPush.update({ where: { id: atual.id }, data: { ativo: false } });
    return atual.id as Uuid;
  }
}
