import { Inject, Injectable } from '@nestjs/common';
import { EnvioManualSolicitado } from '@pz/contracts';
import { z } from 'zod';

import { Consome } from '../eventos/consome.js';
import { FILAS_RUNTIME } from '../fichas.js';
import { definirJob } from '../filas/job.js';

import type { Filas } from '../filas/runtime.js';
import type { EmailCanonico } from '@pz/integracoes';
import type { EventoDominio } from '@pz/kernel';
import type { AnexoDoEnvio, EnviadorDeCanal } from '@pz/notificacoes';

/**
 * Prepara um envio manual (HU32) na fila de relatórios: gerar o anexo (até 5.000 linhas) não
 * segura a fila de eventos. A chave é o id do envio (idempotente).
 */
export const prepararEnvioJob = definirJob({
  fila: 'relatorios',
  tipo: 'notificacoes.preparar-envio',
  dados: z.object({ tenantId: z.uuid(), envio: EnvioManualSolicitado.payload }).strict(),
});

/** Leva o pedido de envio manual à fila. Sem regra aqui. */
@Injectable()
export class ConsumidorDosEnvios {
  constructor(@Inject(FILAS_RUNTIME) private readonly filas: Filas) {}

  @Consome('EnvioManualSolicitado', { versao: 1 })
  async envioSolicitado(_transacao: unknown, evento: EventoDominio): Promise<void> {
    const envio = EnvioManualSolicitado.payload.parse(evento.payload);
    await this.filas.publicar(
      prepararEnvioJob,
      { tenantId: evento.tenantId, envio },
      { tenantId: evento.tenantId },
      envio.envioId,
    );
  }
}

/** Caminho estável do recurso no portal (abrível pelo app, CLAUDE.md, seção 12). */
export function linkDoEnvio(portal: string, anexo: AnexoDoEnvio): string {
  const base = portal.replace(/\/$/, '');
  if (anexo.origem === 'prazo') return `${base}/prazos/${anexo.id}`;
  if (anexo.origem === 'publicacao') return `${base}/publicacoes/${anexo.id}`;
  return `${base}/${anexo.origem === 'busca' ? 'busca' : 'relatorios'}`;
}

/** Canal de e-mail sobre o ProvedorEmail: a mensagem renderizada e o anexo, se houver. */
export function enviadorDeEmail(provedor: {
  enviar(email: EmailCanonico): ReturnType<EnviadorDeCanal['enviar']>;
}): EnviadorDeCanal {
  return {
    enviar: ({ idempotencia, destinatarios, mensagem, anexos }) =>
      provedor.enviar({
        idempotencia,
        para: [...destinatarios],
        assunto: mensagem.assunto,
        html: mensagem.html,
        texto: mensagem.texto,
        ...(anexos === undefined ? {} : { anexos: [...anexos] }),
      }),
  };
}
