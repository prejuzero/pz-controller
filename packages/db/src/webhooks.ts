import { gerarUuidV7 } from '@pz/kernel';

import type { Transacao } from './banco.js';
import type { Instant } from '@pz/kernel';

export interface WebhookParaGravar {
  readonly adaptador: string;
  readonly idExterno: string;
  readonly cabecalhos: Readonly<Record<string, string>>;
  readonly corpo: Uint8Array;
}

export interface WebhookPendente extends WebhookParaGravar {
  readonly id: string;
}

/**
 * Webhooks de entrada no PostgreSQL (HU09). `gravar` roda na api (pz_app, sem tenant, só
 * INSERT); o resto roda no worker como sistema, com `FOR UPDATE SKIP LOCKED` entre réplicas.
 */
export class WebhooksPostgres {
  /** Grava o webhook; false se o mesmo (adaptador, ID externo) já tinha chegado. */
  async gravar(transacao: Transacao, webhook: WebhookParaGravar): Promise<boolean> {
    const inseridos = await transacao.$executeRaw`
      INSERT INTO webhook_recebido (id, adaptador, id_externo, cabecalhos, corpo)
      VALUES (${gerarUuidV7()}::uuid, ${webhook.adaptador}, ${webhook.idExterno},
              ${JSON.stringify(webhook.cabecalhos)}::jsonb, ${Buffer.from(webhook.corpo)})
      ON CONFLICT (adaptador, id_externo) DO NOTHING`;
    return inseridos === 1;
  }

  /** IDs dos webhooks ainda não enfileirados, marcados como enfileirados na mesma transação. */
  async reservarParaEnfileirar(transacao: Transacao, limite: number): Promise<string[]> {
    const linhas = await transacao.$queryRaw<{ id: string }[]>`
      UPDATE webhook_recebido SET enfileirado_em = now()
       WHERE id IN (SELECT id FROM webhook_recebido WHERE enfileirado_em IS NULL
                     ORDER BY recebido_em LIMIT ${limite} FOR UPDATE SKIP LOCKED)
      RETURNING id`;
    return linhas.map((linha) => linha.id);
  }

  /** O webhook a processar, ou undefined se já foi processado (job repetido). */
  async pendente(transacao: Transacao, id: string): Promise<WebhookPendente | undefined> {
    const linha = await transacao.webhookRecebido.findFirst({ where: { id, processadoEm: null } });
    if (linha === null) return undefined;
    return {
      id: linha.id,
      adaptador: linha.adaptador,
      idExterno: linha.idExterno,
      cabecalhos: linha.cabecalhos as Record<string, string>,
      corpo: new Uint8Array(linha.corpo),
    };
  }

  async marcarProcessado(transacao: Transacao, id: string, em: Instant): Promise<void> {
    await transacao.webhookRecebido.update({
      where: { id },
      data: { processadoEm: new Date(em.epochMs) },
    });
  }
}
