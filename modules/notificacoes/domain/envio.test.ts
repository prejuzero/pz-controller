import { Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { situacaoDoEnvio } from './envio.js';

const agora = Instant.deIso('2026-11-05T12:00:00.000Z');
const notificacao = (enviadaEm: Instant | null, rejeitadaEm: Instant | null) => ({
  enviadaEm,
  rejeitadaEm,
  motivoRejeicao: rejeitadaEm === null ? null : 'bounce: 550 fulana@exemplo.invalid',
});

describe('situação do envio manual (PZ-361)', () => {
  it('falha do preparo vence; depois rejeição; depois enviado; senão pendente', () => {
    expect(situacaoDoEnvio({ motivoFalha: 'prazo-inexistente', notificacao: null })).toEqual({
      situacao: 'falhou',
      motivo: 'prazo-inexistente',
    });
    expect(situacaoDoEnvio({ motivoFalha: null, notificacao: notificacao(agora, agora) })).toEqual({
      situacao: 'rejeitado',
      motivo: 'bounce',
    });
    expect(situacaoDoEnvio({ motivoFalha: null, notificacao: notificacao(agora, null) })).toEqual({
      situacao: 'enviado',
      motivo: null,
    });
    expect(situacaoDoEnvio({ motivoFalha: null, notificacao: notificacao(null, null) })).toEqual({
      situacao: 'pendente',
      motivo: null,
    });
    expect(situacaoDoEnvio({ motivoFalha: null, notificacao: null })).toEqual({
      situacao: 'pendente',
      motivo: null,
    });
    expect(
      situacaoDoEnvio({
        motivoFalha: null,
        notificacao: { enviadaEm: agora, rejeitadaEm: agora, motivoRejeicao: null },
      }),
    ).toEqual({ situacao: 'rejeitado', motivo: null });
  });
});
