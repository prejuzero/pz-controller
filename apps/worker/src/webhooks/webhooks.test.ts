import { describe, expect, it } from 'vitest';

import { ConsumidorDosWebhooks } from './consumidor.js';

import type { Filas } from '../filas/runtime.js';
import type { Transacao } from '@pz/db';
import type { EventoDominio, Uuid } from '@pz/kernel';
import type { RegistrarEntregas } from '@pz/webhooks';

// Dados FICTÍCIOS: só a ligação entre o módulo e a fila.
const TENANT = '01a10e00-0000-7000-8000-00000000c001' as Uuid;
const ENTREGA = '01a10e00-0000-7000-8000-00000000c002' as Uuid;
const evento = (tipo: string, payload: Record<string, unknown>): EventoDominio => ({
  id: '01a10e00-0000-7000-8000-00000000c0e1' as Uuid,
  tipo,
  versao: 1,
  tenantId: TENANT,
  agregadoId: ENTREGA,
  ocorridoEm: undefined as never,
  payload,
});

describe('ConsumidorDosWebhooks (HU49)', () => {
  it('cada entrega nova vira um job no tenant, com chave da entrega e do evento', async () => {
    const publicados: { dados: unknown; escopo: unknown; chave: string }[] = [];
    const filas = {
      publicar: (_d: unknown, dados: unknown, escopo: unknown, chave: string) => {
        publicados.push({ dados, escopo, chave });
        return Promise.resolve(chave);
      },
    } as unknown as Filas;
    const registrar = {
      executar: (_tx: unknown, e: EventoDominio) =>
        Promise.resolve(e.tipo === 'PrazoVencido' ? [] : [ENTREGA]),
    } as unknown as RegistrarEntregas<Transacao>;
    const consumidor = new ConsumidorDosWebhooks(registrar, filas);
    const tx = null as unknown as Transacao;
    const eventos: [keyof ConsumidorDosWebhooks, string][] = [
      ['prazoSugerido', 'PrazoSugerido'],
      ['prazoRecalculado', 'PrazoRecalculado'],
      ['prazoConfirmado', 'PrazoConfirmado'],
      ['prazoAjustado', 'PrazoAjustado'],
      ['prazoCumprido', 'PrazoCumprido'],
      ['prazoCancelado', 'PrazoCancelado'],
      ['publicacaoRecebida', 'PublicacaoRecebida'],
      ['cienciaConfirmada', 'CienciaConfirmada'],
      ['prazoVencido', 'PrazoVencido'],
    ];
    for (const [metodo, tipo] of eventos) {
      await consumidor[metodo].call(consumidor, tx, evento(tipo, {}));
    }
    await consumidor.entregaAgendada(tx, evento('EntregaWebhookAgendada', { entregaId: ENTREGA }));
    expect(publicados).toHaveLength(9);
    expect(publicados[0]).toEqual({
      dados: { entregaId: ENTREGA, tenantId: TENANT },
      escopo: { tenantId: TENANT },
      chave: `${ENTREGA}-01a10e00-0000-7000-8000-00000000c0e1`,
    });
  });
});
