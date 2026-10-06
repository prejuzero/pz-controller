import { describe, expect, it, vi } from 'vitest';

import { iniciarMonitoramento } from './monitoramento';

describe('monitoramento no navegador', () => {
  it('sem DSN não inicia', () => {
    const iniciar = vi.fn();
    expect(iniciarMonitoramento(undefined, iniciar)).toBe(false);
    expect(iniciarMonitoramento('', iniciar)).toBe(false);
    expect(iniciar).not.toHaveBeenCalled();
  });

  it('com DSN https inicia sem dados pessoais', () => {
    const iniciar = vi.fn();
    expect(iniciarMonitoramento('https://chave@sentry.exemplo/1', iniciar)).toBe(true);
    expect(iniciar).toHaveBeenCalledWith(expect.objectContaining({ sendDefaultPii: false }));
    expect(() => iniciarMonitoramento('http://inseguro/1', iniciar)).toThrow();
  });
});
