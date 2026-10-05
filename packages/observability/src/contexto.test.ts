import { describe, expect, it } from 'vitest';

import { executarComContexto, obterContexto } from './contexto.js';

describe('contexto de execução', () => {
  it('fica vazio fora de uma execução', () => {
    expect(obterContexto()).toEqual({});
  });

  it('propaga o contexto por chamadas assíncronas e combina contextos aninhados', async () => {
    const resultado = await executarComContexto(
      { requestId: 'req-1', tenantId: 't-1' },
      async () => {
        await Promise.resolve();
        return executarComContexto({ jobId: 'job-9', tenantId: 't-2' }, () => obterContexto());
      },
    );

    expect(resultado).toEqual({ requestId: 'req-1', tenantId: 't-2', jobId: 'job-9' });
    expect(obterContexto()).toEqual({});
  });

  it('isola execuções concorrentes', async () => {
    const ler = (requestId: string) =>
      executarComContexto({ requestId }, async () => {
        await new Promise((resolver) => setTimeout(resolver, 5));
        return obterContexto().requestId;
      });

    await expect(Promise.all([ler('a'), ler('b')])).resolves.toEqual(['a', 'b']);
  });
});
