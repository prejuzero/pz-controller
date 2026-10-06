import { describe, expect, it } from 'vitest';

import { deDataIso, formatarDataBr, paraDataIso } from './seletor-data.js';

describe('datas do seletor', () => {
  it('converte AAAA-MM-DD para Date local e volta', () => {
    const data = deDataIso('2028-02-29');
    expect(data?.getDate()).toBe(29);
    expect(data && paraDataIso(data)).toBe('2028-02-29');
  });

  it('recusa formato ou dia inexistente', () => {
    expect(deDataIso('29/02/2028')).toBeUndefined();
    expect(deDataIso('2026-02-29')).toBeUndefined();
  });

  it('formata para DD/MM/AAAA', () => {
    expect(formatarDataBr('2026-12-21')).toBe('21/12/2026');
    expect(formatarDataBr('21/12/2026')).toBeUndefined();
  });
});
