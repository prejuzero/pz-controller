import Anthropic from '@anthropic-ai/sdk';
import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from '@pz/integracoes';
import { describe, expect, it } from 'vitest';

import { classificarErroAnthropic } from './erros.js';

const http = (status: number) =>
  Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type: 'x', message: 'x' } },
    'x',
    new Headers(),
  );

describe('classificação dos erros da Anthropic', () => {
  it.each([
    [401, ErroCredencialInvalida],
    [403, ErroCredencialInvalida],
    [429, ErroLimiteExcedido],
    [529, ErroTransitorio],
    [500, ErroTransitorio],
    [408, ErroTransitorio],
    [409, ErroTransitorio],
    [400, ErroPermanente],
    [404, ErroPermanente],
    [413, ErroPermanente],
  ] as const)('HTTP %i', (status, classe) => {
    expect(classificarErroAnthropic(http(status))).toBeInstanceOf(classe);
  });

  it('conexão, timeout e erro desconhecido', () => {
    expect(
      classificarErroAnthropic(new Anthropic.APIConnectionError({ message: 'x' })),
    ).toBeInstanceOf(ErroTransitorio);
    expect(classificarErroAnthropic(new Anthropic.APIConnectionTimeoutError())).toBeInstanceOf(
      ErroTransitorio,
    );
    expect(
      classificarErroAnthropic(new Anthropic.APIError(undefined, undefined, 'x', undefined)),
    ).toBeInstanceOf(ErroTransitorio);
    const outro = classificarErroAnthropic(new Error('x'));
    expect(outro).toBeInstanceOf(ErroPermanente);
    expect(outro.adaptador).toBe('anthropic');
  });
});
