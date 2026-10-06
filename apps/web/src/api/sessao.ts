import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { SessaoAtual } from '@pz/contracts';

/**
 * Formulários de acesso mostram o erro no próprio formulário (aria-live): o 401 de senha errada
 * não é sessão expirada, e o aviso global seria redundante (ver cache.ts).
 */
export const ERRO_NO_FORMULARIO = { erroNoFormulario: true } as const;

/** Consultas e mutações da sessão (HU06). Os hooks em hooks.ts só as repassam ao React. */
export const consultasSessao = (api: ClienteApi) => ({
  atual: () =>
    queryOptions({
      queryKey: chaves.sessao.atual(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/auth/eu', { signal })),
    }),
  acessos: () =>
    queryOptions({
      queryKey: chaves.sessao.acessos(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/auth/acessos', { signal })),
    }),
  dispositivos: () =>
    queryOptions({
      queryKey: chaves.sessao.dispositivos(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/auth/dispositivos', { signal })),
    }),
});

export const mutacoesSessao = (api: ClienteApi, cache: QueryClient) => {
  const guardar = (sessao: SessaoAtual) => {
    cache.setQueryData(chaves.sessao.atual(), sessao);
  };
  return {
    entrar: {
      meta: ERRO_NO_FORMULARIO,
      mutationFn: (body: { email: string; senha: string }) =>
        exigir(api.POST('/v1/auth/entrar', { body })),
      onSuccess: guardar,
    },
    verificarSegundoFator: {
      meta: ERRO_NO_FORMULARIO,
      mutationFn: (body: { codigo: string }) =>
        exigir(api.POST('/v1/auth/2fa/verificar', { body })),
      onSuccess: guardar,
    },
    configurarSegundoFator: {
      meta: ERRO_NO_FORMULARIO,
      mutationFn: () => exigir(api.POST('/v1/auth/2fa/configurar')),
    },
    ativarSegundoFator: {
      meta: ERRO_NO_FORMULARIO,
      mutationFn: (body: { codigo: string }) => exigir(api.POST('/v1/auth/2fa/ativar', { body })),
      onSuccess: ({ sessao }: { sessao: SessaoAtual }) => {
        guardar(sessao);
      },
    },
    solicitarRedefinicao: {
      meta: ERRO_NO_FORMULARIO,
      mutationFn: (body: { email: string }) => exigir(api.POST('/v1/auth/senha/esqueci', { body })),
    },
    redefinirSenha: {
      meta: ERRO_NO_FORMULARIO,
      mutationFn: (body: { token: string; novaSenha: string }) =>
        exigir(api.POST('/v1/auth/senha/redefinir', { body })),
    },
    revogarDispositivo: {
      mutationFn: (id: string) =>
        exigir(api.DELETE('/v1/auth/dispositivos/{id}', { params: { path: { id } } })),
      onSuccess: () => cache.invalidateQueries({ queryKey: chaves.sessao.dispositivos() }),
    },
    sair: {
      mutationFn: () => exigir(api.POST('/v1/auth/sair')),
      // Sem sessão, nada em cache pertence mais a ninguém.
      onSuccess: () => {
        cache.clear();
      },
    },
  };
};
