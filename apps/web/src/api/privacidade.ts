import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { PedidoDePublicacaoDeDocumento } from '@pz/contracts';

/** Termos e privacidade (HU38). Os hooks em hooks.ts só repassam. */
export const consultasPrivacidade = (api: ClienteApi) => ({
  vigentes: () =>
    queryOptions({
      queryKey: chaves.privacidade.vigentes(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/termos/vigentes', { signal })),
    }),
  pendentes: () =>
    queryOptions({
      queryKey: chaves.privacidade.pendentes(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/termos/pendentes', { signal })),
    }),
  aceites: () =>
    queryOptions({
      queryKey: chaves.privacidade.aceites(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/termos/aceites', { signal })),
    }),
  exportacao: (id: string) =>
    queryOptions({
      queryKey: chaves.privacidade.exportacao(id),
      queryFn: ({ signal }) =>
        exigir(api.GET('/v1/privacidade/exportacoes/{id}', { params: { path: { id } }, signal })),
      // Enquanto o worker gera os arquivos, consulta de novo a cada 5 s.
      refetchInterval: (consulta) => (consulta.state.data?.situacao === 'pendente' ? 5_000 : false),
    }),
  encerramento: () =>
    queryOptions({
      queryKey: chaves.privacidade.encerramento(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/privacidade/encerramento', { signal })),
    }),
  /** Histórico de versões publicadas (administrador da plataforma, PZ-303). */
  versoes: () =>
    queryOptions({
      queryKey: chaves.privacidade.versoes(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/admin/documentos-legais', { signal })),
    }),
});

export const mutacoesPrivacidade = (api: ClienteApi, cache: QueryClient) => {
  const invalidar = () => cache.invalidateQueries({ queryKey: chaves.privacidade.todas });
  return {
    aceitar: {
      mutationFn: async (ids: readonly string[]) => {
        for (const id of ids) {
          await exigir(api.POST('/v1/termos/{id}/aceitar', { params: { path: { id } } }));
        }
      },
      // A sessão deixa de pedir o aceite (proximoPasso) e as rotas voltam a responder.
      onSuccess: () =>
        Promise.all([invalidar(), cache.invalidateQueries({ queryKey: chaves.sessao.todas })]),
    },
    publicar: {
      mutationFn: (pedido: PedidoDePublicacaoDeDocumento) => {
        // Sem o resumo, a chave não vai (exactOptionalPropertyTypes no cliente gerado).
        const { resumoAlteracoes, ...resto } = pedido;
        return exigir(
          api.POST('/v1/admin/documentos-legais', {
            body: resumoAlteracoes === undefined ? resto : { ...resto, resumoAlteracoes },
          }),
        );
      },
      onSuccess: invalidar,
    },
    exportar: {
      mutationFn: (escopo: 'titular' | 'escritorio') =>
        exigir(api.POST('/v1/privacidade/exportacoes', { body: { escopo } })),
    },
    encerrar: {
      mutationFn: () => exigir(api.POST('/v1/privacidade/encerramento')),
      onSuccess: invalidar,
    },
    cancelarEncerramento: {
      mutationFn: () => exigir(api.POST('/v1/privacidade/encerramento/cancelar')),
      onSuccess: invalidar,
    },
  };
};
