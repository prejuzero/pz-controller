import { Instant } from '@pz/kernel';

import { Notificacao } from '../domain/notificacao.js';

import type {
  ListaDeSupressao,
  PreferenciasDeNotificacao,
  RepositorioDeNotificacoes,
} from '../application/portas.js';
import type { Canal, TipoDeNotificacao } from '../domain/notificacao.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/** Notificações no PostgreSQL (HU30), no tenant da transação (RLS). */
export class NotificacoesPostgres implements RepositorioDeNotificacoes<Transacao> {
  async inserir(tx: Transacao, notificacao: Notificacao): Promise<boolean> {
    const e = notificacao.estado;
    // ON CONFLICT DO NOTHING na chave de idempotência: pedido repetido não aborta a transação.
    const { count } = await tx.notificacao.createMany({
      data: [
        {
          id: e.id,
          tenantId: e.tenantId,
          usuarioId: e.usuarioId,
          prazoId: e.prazoId ?? null,
          canal: e.canal,
          tipo: e.tipo,
          chaveIdempotencia: e.chave,
          template: e.tipo,
          versaoTemplate: e.versaoTemplate,
          destinatarios: [...e.destinatarios],
          dados: e.dados as object,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async buscar(tx: Transacao, id: Uuid): Promise<Notificacao | undefined> {
    const l = await tx.notificacao.findUnique({ where: { id } });
    if (l === null) return undefined;
    return Notificacao.restaurar({
      id: l.id as Uuid,
      tenantId: l.tenantId as Uuid,
      usuarioId: l.usuarioId as Uuid,
      ...(l.prazoId === null ? {} : { prazoId: l.prazoId as Uuid }),
      canal: l.canal,
      tipo: l.tipo as TipoDeNotificacao,
      chave: l.chaveIdempotencia,
      versaoTemplate: l.versaoTemplate,
      destinatarios: l.destinatarios,
      dados: l.dados,
      ...(l.enviadaEm === null ? {} : { enviadaEm: Instant.deEpochMs(l.enviadaEm.getTime()) }),
      ...(l.idExterno === null ? {} : { idExterno: l.idExterno }),
    });
  }

  async registrarEnvio(tx: Transacao, notificacao: Notificacao): Promise<void> {
    const { id, idExterno, enviadaEm } = notificacao.estado;
    await tx.notificacao.update({
      where: { id },
      data: {
        idExterno: idExterno ?? null,
        enviadaEm: enviadaEm === undefined ? null : new Date(enviadaEm.epochMs),
      },
    });
  }
}

export class PreferenciasPostgres implements PreferenciasDeNotificacao<Transacao> {
  async ativo(
    tx: Transacao,
    usuarioId: Uuid,
    tipo: TipoDeNotificacao,
    canal: Canal,
  ): Promise<boolean | undefined> {
    const linha = await tx.preferenciaNotificacao.findUnique({
      where: { usuarioId_tipo_canal: { usuarioId, tipo, canal } },
      select: { ativo: true },
    });
    return linha?.ativo;
  }
}

export class SupressaoPostgres implements ListaDeSupressao<Transacao> {
  async suprimidos(tx: Transacao, emails: readonly string[]): Promise<ReadonlySet<string>> {
    if (emails.length === 0) return new Set();
    const linhas = await tx.supressao.findMany({
      where: { email: { in: emails.map((e) => e.toLowerCase()) } },
      select: { email: true },
    });
    return new Set(linhas.map((l) => l.email));
  }
}
