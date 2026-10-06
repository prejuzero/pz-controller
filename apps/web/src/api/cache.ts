import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { descreverErro, ehSessaoExpirada, ErroApi, type DescricaoErro } from './erros';

export interface AcoesDeErro {
  avisarErro: (erro: DescricaoErro) => void;
  /** Sessão expirada (401): avisar e levar a /entrar preservando a URL. */
  sessaoExpirada: () => void;
}

const MAXIMO_RETENTATIVAS = 2;

/** Erro do cliente (4xx) não melhora com retentativa; falha de rede ou 5xx pode melhorar. */
export function deveTentarNovamente(falhas: number, erro: unknown): boolean {
  if (erro instanceof ErroApi && erro.status < 500) return false;
  return falhas < MAXIMO_RETENTATIVAS;
}

/**
 * Tratamento global de erros: 401 → sessão expirada; mutação → aviso (toast); consulta sem dados
 * → página de erro (error boundary); falha ao atualizar dados já exibidos → aviso.
 */
export function criarCache(acoes: AcoesDeErro): QueryClient {
  const tratar = (erro: unknown) => {
    if (ehSessaoExpirada(erro)) acoes.sessaoExpirada();
    else acoes.avisarErro(descreverErro(erro));
  };
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (erro, consulta) => {
        if (ehSessaoExpirada(erro) || consulta.state.data !== undefined) tratar(erro);
      },
    }),
    mutationCache: new MutationCache({ onError: tratar }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: deveTentarNovamente,
        throwOnError: (erro, consulta) =>
          !ehSessaoExpirada(erro) && consulta.state.data === undefined,
      },
      mutations: { retry: false },
    },
  });
}
