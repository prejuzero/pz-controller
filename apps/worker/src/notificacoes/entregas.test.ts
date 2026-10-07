import { Instant } from '@pz/kernel';
import { registrarRejeicaoEmail } from '@pz/observability';
import { describe, expect, it, vi } from 'vitest';

import { processadorDeEntregas } from './entregas.js';

import type { Transacao, WebhookPendente } from '@pz/db';
import type { EventoEntrega } from '@pz/integracoes';
import type { RegistrarDesfechosDeEntrega } from '@pz/notificacoes';
import type * as Observabilidade from '@pz/observability';

vi.mock('@pz/observability', async (original) => ({
  ...(await original<typeof Observabilidade>()),
  registrarRejeicaoEmail: vi.fn(),
}));

const em = Instant.deIso('2026-10-07T12:00:00Z');
const webhook: WebhookPendente = {
  id: '0199b5a0-0000-7000-8000-000000000000',
  adaptador: 'ses',
  idExterno: 'sns-1',
  cabecalhos: {},
  corpo: new Uint8Array(),
};

describe('processador de entregas (HU30)', () => {
  it('interpreta, aplica na transação do webhook e conta as rejeições para o alerta', async () => {
    const eventos: EventoEntrega[] = [
      { idExterno: 'a', tipo: 'entregue', ocorridoEm: em },
      { idExterno: 'a', tipo: 'rejeitado', ocorridoEm: em },
      { idExterno: 'b', tipo: 'reclamacao', ocorridoEm: em },
      { idExterno: 'c', tipo: 'falhou', ocorridoEm: em },
    ];
    const executar = vi.fn(() => Promise.resolve({ rejeicoes: [], semNotificacao: 2 }));
    const tx = {} as Transacao;
    await processadorDeEntregas(() => Promise.resolve(eventos), {
      executar,
    } as unknown as RegistrarDesfechosDeEntrega<Transacao>)(tx, webhook);
    expect(executar).toHaveBeenCalledWith(tx, eventos);
    expect(vi.mocked(registrarRejeicaoEmail).mock.calls).toEqual([['bounce'], ['spam'], ['falha']]);
  });
});
