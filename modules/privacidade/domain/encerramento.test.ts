import { Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  CARENCIA_DO_ENCERRAMENTO_DIAS,
  novoEncerramento,
  situacaoDoEncerramento,
} from './encerramento.js';

const agora = Instant.deIso('2026-10-07T12:00:00Z');

describe('encerramento da conta (HU38)', () => {
  it('carência de 30 dias a partir do pedido (decisão do produto)', () => {
    expect(CARENCIA_DO_ENCERRAMENTO_DIAS).toBe(30);
    expect(novoEncerramento('u' as never, agora).efetivarEm.paraIso()).toBe(
      '2026-11-06T12:00:00.000Z',
    );
  });

  it('situação: em carência, cancelado, vencido ou efetivado', () => {
    const e = novoEncerramento('u' as never, agora);
    expect(situacaoDoEncerramento(e, agora)).toBe('em-carencia');
    expect(situacaoDoEncerramento(e, Instant.deIso('2026-11-06T12:00:00Z'))).toBe('vencido');
    expect(situacaoDoEncerramento({ ...e, canceladoEm: agora }, agora)).toBe('cancelado');
    expect(situacaoDoEncerramento({ ...e, efetivadoEm: agora }, agora)).toBe('efetivado');
  });
});
