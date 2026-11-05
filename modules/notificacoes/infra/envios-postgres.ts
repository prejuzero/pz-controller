import { Instant } from '@pz/kernel';

import { situacaoDoEnvio } from '../domain/envio.js';

import type { RepositorioDeEnvios } from '../application/portas.js';
import type { EnvioRecente, RecursoDoEnvio } from '../domain/envio.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

interface LinhaDoEnvio {
  id: string;
  recurso: string;
  destinatarios: number;
  motivo_falha: string | null;
  criado_em: Date;
  enviada_em: Date | null;
  rejeitada_em: Date | null;
  motivo_rejeicao: string | null;
  notificacao_id: string | null;
}

const instante = (d: Date | null) => (d === null ? null : Instant.deEpochMs(d.getTime()));

const paraEnvio = (l: LinhaDoEnvio): EnvioRecente => ({
  id: l.id as Uuid,
  recurso: l.recurso as RecursoDoEnvio,
  destinatarios: l.destinatarios,
  criadoEm: Instant.deEpochMs(l.criado_em.getTime()),
  ...situacaoDoEnvio({
    motivoFalha: l.motivo_falha,
    notificacao:
      l.notificacao_id === null
        ? null
        : {
            enviadaEm: instante(l.enviada_em),
            rejeitadaEm: instante(l.rejeitada_em),
            motivoRejeicao: l.motivo_rejeicao,
          },
  }),
});

/** Envios manuais do escritório da transação (RLS), com a notificação vinculada (PZ-361). */
export class EnviosPostgres implements RepositorioDeEnvios<Transacao> {
  async registrar(
    tx: Transacao,
    e: {
      id: Uuid;
      tenantId: Uuid;
      usuarioId: Uuid;
      recurso: RecursoDoEnvio;
      destinatarios: number;
    },
  ): Promise<void> {
    await tx.envioManual.create({
      data: {
        id: e.id,
        tenantId: e.tenantId,
        usuarioId: e.usuarioId,
        recurso: e.recurso,
        destinatarios: e.destinatarios,
      },
    });
  }

  async vincularNotificacao(tx: Transacao, envioId: Uuid, notificacaoId: Uuid): Promise<void> {
    await tx.envioManual.updateMany({ where: { id: envioId }, data: { notificacaoId } });
  }

  async marcarFalha(tx: Transacao, envioId: Uuid, motivo: string, em: Instant): Promise<void> {
    await tx.envioManual.updateMany({
      where: { id: envioId, motivoFalha: null },
      data: { motivoFalha: motivo, falhouEm: new Date(em.epochMs) },
    });
  }

  async recentes(tx: Transacao, usuarioId: Uuid, limite: number): Promise<EnvioRecente[]> {
    const linhas = await tx.$queryRaw<LinhaDoEnvio[]>`
      SELECT e.id::text, e.recurso, e.destinatarios, e.motivo_falha, e.criado_em,
             e.notificacao_id::text, n.enviada_em, n.rejeitada_em, n.motivo_rejeicao
        FROM envio_manual e LEFT JOIN notificacao n ON n.id = e.notificacao_id
       WHERE e.usuario_id = ${usuarioId}::uuid
       ORDER BY e.criado_em DESC, e.id DESC
       LIMIT ${limite}`;
    return linhas.map(paraEnvio);
  }

  async comProblemaDesde(tx: Transacao, usuarioId: Uuid, desde: Instant): Promise<number> {
    const [linha] = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total
        FROM envio_manual e LEFT JOIN notificacao n ON n.id = e.notificacao_id
       WHERE e.usuario_id = ${usuarioId}::uuid AND e.criado_em >= ${new Date(desde.epochMs)}
         AND (e.motivo_falha IS NOT NULL OR n.rejeitada_em IS NOT NULL)`;
    return Number(linha?.total ?? 0);
  }
}
