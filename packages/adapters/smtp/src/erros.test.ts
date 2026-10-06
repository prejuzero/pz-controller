import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from '@pz/integracoes';
import { describe, expect, it } from 'vitest';

import { classificarErroSmtp } from './erros.js';

describe('classificação dos erros do SMTP (RFC 5321)', () => {
  it.each([
    [{ code: 'EAUTH', responseCode: 535 }, ErroCredencialInvalida],
    [{ code: 'EENVELOPE', responseCode: 534 }, ErroCredencialInvalida],
    [{ code: 'EENVELOPE', responseCode: 421 }, ErroLimiteExcedido],
    [{ code: 'EENVELOPE', responseCode: 452 }, ErroLimiteExcedido],
    [{ code: 'EENVELOPE', responseCode: 550 }, ErroPermanente],
    [{ code: 'EMESSAGE', responseCode: 554 }, ErroPermanente],
    [{ code: 'EENVELOPE', responseCode: 441 }, ErroTransitorio],
    [{ code: 'ECONNECTION' }, ErroTransitorio],
    [{ code: 'ETIMEDOUT' }, ErroTransitorio],
    [new Error('socket hang up'), ErroTransitorio],
    [{ code: 'EOUTRO', responseCode: 200 }, ErroPermanente],
  ])('%o → %o', (erro, classe) => {
    const classificado = classificarErroSmtp(erro);
    expect(classificado).toBeInstanceOf(classe);
    expect(classificado.adaptador).toBe('smtp');
  });

  it('mensagem só com código e resposta (nunca o conteúdo do e-mail)', () => {
    expect(classificarErroSmtp({ code: 'EAUTH', responseCode: 535 }).message).toBe(
      'SMTP EAUTH (535)',
    );
  });
});
