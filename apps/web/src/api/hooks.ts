'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

import { consultasSessao, mutacoesSessao } from './sessao';

import type { ClienteApi } from './cliente';

export const ContextoApi = createContext<ClienteApi | null>(null);

export function useApi(): ClienteApi {
  const api = useContext(ContextoApi);
  if (api === null) throw new Error('useApi fora do <Provedores>.');
  return api;
}

export function useSessao() {
  return useQuery(consultasSessao(useApi()).atual());
}

export function useSair() {
  const cache = useQueryClient();
  return useMutation(mutacoesSessao(useApi(), cache).sair);
}
