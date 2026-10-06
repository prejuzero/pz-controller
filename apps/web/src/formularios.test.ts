import { describe, expect, it } from 'vitest';

import { paraErroApi } from './api/erros';
import { chaveValidacao, erroDeAcesso } from './formularios';

const erro = (status: number) =>
  paraErroApi(status, { type: 'about:blank', title: 'Conflito', status, codigo: 'x' });

describe('formulários de acesso', () => {
  it('traduz o código do Zod para o catálogo', () => {
    expect(chaveValidacao('too_small')).toBe('obrigatorio');
    expect(chaveValidacao('required')).toBe('obrigatorio');
    expect(chaveValidacao('too_big')).toBe('muitoLongo');
    expect(chaveValidacao('maxLength')).toBe('muitoLongo');
    expect(chaveValidacao('confirmacao')).toBe('confirmacaoDiferente');
    expect(chaveValidacao(undefined)).toBe('invalido');
  });

  it('401 e 429 têm texto próprio; o resto vem do problem+json', () => {
    expect(erroDeAcesso(erro(401), 'credenciaisInvalidas')).toEqual({
      chave: 'credenciaisInvalidas',
    });
    expect(erroDeAcesso(erro(429), 'codigoInvalido')).toEqual({ chave: 'muitasTentativas' });
    expect(erroDeAcesso(erro(409), 'codigoInvalido')).toMatchObject({ titulo: 'Conflito' });
  });
});
