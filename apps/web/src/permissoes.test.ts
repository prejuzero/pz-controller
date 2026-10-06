import { describe, expect, it } from 'vitest';

import { filtrarPermitidos, permite } from './permissoes';

describe('permissoes', () => {
  it('exige todas as permissões pedidas', () => {
    expect(permite(['prazos:ler'], 'prazos:ler')).toBe(true);
    expect(permite(['prazos:ler'], ['prazos:ler', 'prazos:confirmar'])).toBe(false);
    expect(permite(['prazos:ler', 'prazos:confirmar'], ['prazos:ler', 'prazos:confirmar'])).toBe(
      true,
    );
    expect(permite([], 'prazos:ler')).toBe(false);
  });

  it('não concede nada a uma exigência vazia, como o back', () => {
    expect(permite(['prazos:ler'], [])).toBe(false);
  });

  it('não confunde permissões com prefixo comum', () => {
    expect(permite(['prazos:ler'], 'prazos')).toBe(false);
  });

  it('mantém itens sem permissão e oculta os não concedidos', () => {
    const itens = [{ id: 'a' }, { id: 'b', permissao: 'prazos:ler' }, { id: 'c', permissao: 'x' }];
    expect(filtrarPermitidos(itens, ['prazos:ler']).map((i) => i.id)).toEqual(['a', 'b']);
    expect(filtrarPermitidos(itens, []).map((i) => i.id)).toEqual(['a']);
    expect(filtrarPermitidos([{ permissao: 1 }], ['1'])).toEqual([]);
  });
});
