import { describe, expect, it, vi } from 'vitest';

import { criarCache, deveTentarNovamente } from './cache';
import { paraErroApi } from './erros';
import { ERRO_NO_FORMULARIO } from './sessao';

const erro = (status: number) =>
  paraErroApi(status, {
    type: 'about:blank',
    title: `Erro ${String(status)}`,
    status,
    codigo: 'teste',
  });

function montar() {
  const acoes = { avisarErro: vi.fn(), sessaoExpirada: vi.fn() };
  const cache = criarCache(acoes);
  cache.setDefaultOptions({ queries: { ...cache.getDefaultOptions().queries, retry: false } });
  return { acoes, cache };
}

describe('tratamento global de erros', () => {
  it('retenta só falha de rede e 5xx, até 2 vezes', () => {
    expect(deveTentarNovamente(0, erro(404))).toBe(false);
    expect(deveTentarNovamente(0, erro(503))).toBe(true);
    expect(deveTentarNovamente(1, new TypeError('rede'))).toBe(true);
    expect(deveTentarNovamente(2, erro(503))).toBe(false);
  });

  it('401 em consulta leva à sessão expirada, sem página de erro', async () => {
    const { acoes, cache } = montar();
    await cache
      .query({ queryKey: ['x'], queryFn: () => Promise.reject(erro(401)) })
      .catch(() => undefined);
    expect(acoes.sessaoExpirada).toHaveBeenCalledOnce();
    const throwOnError = cache.getDefaultOptions().queries?.throwOnError;
    expect(typeof throwOnError).toBe('function');
  });

  it('consulta sem dados vai para a página de erro; com dados, vira aviso', async () => {
    const { acoes, cache } = montar();
    await cache
      .query({ queryKey: ['a'], queryFn: () => Promise.reject(erro(500)) })
      .catch(() => undefined);
    expect(acoes.avisarErro).not.toHaveBeenCalled();
    const consulta = cache.getQueryCache().find({ queryKey: ['a'] });
    const throwOnError = cache.getDefaultOptions().queries?.throwOnError as (
      e: unknown,
      q: unknown,
    ) => boolean;
    expect(throwOnError(erro(500), consulta)).toBe(true);
    expect(throwOnError(erro(401), consulta)).toBe(false);

    cache.setQueryData(['b'], 1);
    await cache
      .query({ queryKey: ['b'], queryFn: () => Promise.reject(erro(500)), staleTime: 0 })
      .catch(() => undefined);
    expect(acoes.avisarErro).toHaveBeenCalledWith({
      titulo: 'Erro 500',
      descricao: expect.any(String) as string,
      codigo: 'teste',
    });
  });

  it('mutação com erro vira aviso; 401 vira sessão expirada', async () => {
    const { acoes, cache } = montar();
    const executar = (e: Error) =>
      cache
        .getMutationCache()
        .build(cache, { mutationFn: () => Promise.reject(e) })
        .execute(undefined)
        .catch(() => undefined);
    await executar(erro(409));
    await executar(erro(401));
    expect(acoes.avisarErro).toHaveBeenCalledOnce();
    expect(acoes.sessaoExpirada).toHaveBeenCalledOnce();
  });

  it('mutação de formulário de acesso trata o próprio erro, inclusive o 401', async () => {
    const { acoes, cache } = montar();
    await cache
      .getMutationCache()
      .build(cache, { meta: ERRO_NO_FORMULARIO, mutationFn: () => Promise.reject(erro(401)) })
      .execute(undefined)
      .catch(() => undefined);
    expect(acoes.avisarErro).not.toHaveBeenCalled();
    expect(acoes.sessaoExpirada).not.toHaveBeenCalled();
  });
});
