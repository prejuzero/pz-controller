import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { avaliarSituacao, VerificacaoDeSituacao } from './situacao.js';

const ok = { dependencia: 'banco', disponivel: true, latenciaMs: 3 };
const fora = { dependencia: 'redis', disponivel: false, latenciaMs: 2000, motivo: 'timeout' };

describe('situação da plataforma', () => {
  it('só é operacional se todas as dependências responderem', () => {
    expect(avaliarSituacao([ok, ok])).toBe('operacional');
    expect(avaliarSituacao([ok, fora])).toBe('degradada');
    expect(avaliarSituacao([])).toBe('operacional');
  });

  it('a verificação publica SituacaoVerificada v1 com o tenant e o instante', () => {
    const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));
    const tenantId = gerarUuidV7(relogio);

    const verificacao = VerificacaoDeSituacao.registrar(tenantId, [ok, fora], relogio);

    expect(verificacao.situacao).toBe('degradada');
    expect(verificacao.retirarEventos()).toEqual([
      expect.objectContaining({
        tipo: 'SituacaoVerificada',
        versao: 1,
        tenantId,
        agregadoId: verificacao.id,
        ocorridoEm: relogio.agora(),
        payload: { situacao: 'degradada' },
      }),
    ]);
  });
});
