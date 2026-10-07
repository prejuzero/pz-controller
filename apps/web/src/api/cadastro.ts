import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';
import { ERRO_NO_FORMULARIO } from './sessao';

import type { paths } from '@pz/contracts/gerado/api';

type Corpo<
  Caminho extends keyof paths,
  Metodo extends 'post' | 'patch',
> = paths[Caminho][Metodo] extends {
  requestBody: { content: { 'application/json': infer C } };
}
  ? C
  : never;

/** Consultas e mutações do cadastro do advogado (HU11). Os hooks em hooks.ts só as repassam. */
export const consultasCadastro = (api: ClienteApi) => ({
  perfil: () =>
    queryOptions({
      queryKey: chaves.cadastro.perfil(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/perfil', { signal })),
    }),
});

export const mutacoesCadastro = (api: ClienteApi, cache: QueryClient) => {
  const invalidar = () => cache.invalidateQueries({ queryKey: chaves.cadastro.todas });
  return {
    cadastrar: {
      meta: ERRO_NO_FORMULARIO,
      mutationFn: (body: Corpo<'/v1/cadastro', 'post'>) =>
        exigir(api.POST('/v1/cadastro', { body })),
    },
    verificarEmail: {
      meta: ERRO_NO_FORMULARIO,
      mutationFn: (token: string) => exigir(api.POST('/v1/email/verificar', { body: { token } })),
    },
    atualizarPerfil: {
      meta: ERRO_NO_FORMULARIO,
      mutationFn: (body: Corpo<'/v1/perfil', 'patch'>) => exigir(api.PATCH('/v1/perfil', { body })),
      onSuccess: invalidar,
    },
    adicionarOab: {
      meta: ERRO_NO_FORMULARIO,
      mutationFn: (body: { numero: string; uf: string }) => exigir(api.POST('/v1/oabs', { body })),
      onSuccess: invalidar,
    },
    removerOab: {
      mutationFn: (id: string) => exigir(api.DELETE('/v1/oabs/{id}', { params: { path: { id } } })),
      onSuccess: invalidar,
    },
  };
};
