import { FixedClock, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsumidorDeNotificacoes } from './consumidor.js';

import type { Transacao } from '@pz/db';
import type {
  AvisarSituacaoDaFonte,
  EnviarNotificacao,
  NotificacaoSolicitada,
} from '@pz/notificacoes';

// Dados FICTÍCIOS: o consumidor só repassa ao caso de uso e mede o SLO de e-mail (HU40).
const relogio = new FixedClock(Instant.deIso('2026-11-05T12:03:00.000Z'));
const solicitada = (tipo: string, canal: string) =>
  ({
    tipo: 'NotificacaoSolicitada',
    ocorridoEm: Instant.deIso('2026-11-05T12:00:00.000Z'),
    payload: { notificacaoId: `n-${tipo}-${canal}`, tipo, canal },
  }) as unknown as NotificacaoSolicitada;

describe('consumidor de notificações (HU30, HU40)', () => {
  it('envia cada notificação pedida; reentrega e outros tipos não quebram', async () => {
    const enviadas: string[] = [];
    const respostas = ['enviada', 'ja-enviada', 'enviada', 'enviada'];
    const enviar = {
      executar: (_tx: Transacao, id: string) => {
        enviadas.push(id);
        return Promise.resolve(respostas.shift());
      },
    } as unknown as EnviarNotificacao<Transacao>;
    const consumidor = new ConsumidorDeNotificacoes(
      enviar,
      {} as AvisarSituacaoDaFonte<Transacao>,
      relogio,
    );
    const tx = {} as Transacao;
    await consumidor.solicitada(tx, solicitada('nova-intimacao', 'email'));
    await consumidor.solicitada(tx, solicitada('nova-intimacao', 'email'));
    await consumidor.solicitada(tx, solicitada('nova-intimacao', 'push'));
    await consumidor.solicitada(tx, solicitada('lembrete', 'email'));
    expect(enviadas).toEqual([
      'n-nova-intimacao-email',
      'n-nova-intimacao-email',
      'n-nova-intimacao-push',
      'n-lembrete-email',
    ]);
  });
});
