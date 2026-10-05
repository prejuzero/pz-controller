import { FixedClock, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsultarSituacao } from './consultar-situacao.js';

import type { VerificadorDeDependencia } from './consultar-situacao.js';

const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));

function verificador(nome: string, comportamento: () => Promise<void>): VerificadorDeDependencia {
  return { nome, verificar: comportamento };
}

describe('ConsultarSituacao', () => {
  it('verifica as dependências em paralelo e informa versão, instante e motivo das falhas', async () => {
    const consulta = new ConsultarSituacao(
      [
        verificador('banco', () => Promise.resolve()),
        verificador('redis', () => Promise.reject(new Error('ECONNREFUSED'))),
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- testa rejeição sem Error
        verificador('armazenamento', () => Promise.reject('texto')),
      ],
      relogio,
      'abc123',
    );

    const relatorio = await consulta.executar();

    expect(relatorio).toEqual({
      situacao: 'degradada',
      versao: 'abc123',
      verificadoEm: relogio.agora(),
      dependencias: [
        { dependencia: 'banco', disponivel: true, latenciaMs: 0 },
        { dependencia: 'redis', disponivel: false, latenciaMs: 0, motivo: 'ECONNREFUSED' },
        { dependencia: 'armazenamento', disponivel: false, latenciaMs: 0, motivo: 'texto' },
      ],
    });
  });

  it('dependência que não responde no limite conta como indisponível', async () => {
    const consulta = new ConsultarSituacao(
      [verificador('lento', () => new Promise(() => undefined))],
      relogio,
      'abc123',
      20,
    );

    const relatorio = await consulta.executar();

    expect(relatorio.situacao).toBe('degradada');
    expect(relatorio.dependencias[0]?.motivo).toBe('sem resposta em 20 ms');
  });
});
