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

function useMutacoesSessao() {
  return mutacoesSessao(useApi(), useQueryClient());
}

export function useSessao() {
  return useQuery(consultasSessao(useApi()).atual());
}

export function useAcessos() {
  return useQuery(consultasSessao(useApi()).acessos());
}

export function useDispositivos() {
  return useQuery(consultasSessao(useApi()).dispositivos());
}

export const useEntrar = () => useMutation(useMutacoesSessao().entrar);
export const useVerificarSegundoFator = () =>
  useMutation(useMutacoesSessao().verificarSegundoFator);
export const useConfigurarSegundoFator = () =>
  useMutation(useMutacoesSessao().configurarSegundoFator);
export const useAtivarSegundoFator = () => useMutation(useMutacoesSessao().ativarSegundoFator);
export const useSolicitarRedefinicao = () => useMutation(useMutacoesSessao().solicitarRedefinicao);
export const useRedefinirSenha = () => useMutation(useMutacoesSessao().redefinirSenha);
export const useRevogarDispositivo = () => useMutation(useMutacoesSessao().revogarDispositivo);
export const useSair = () => useMutation(useMutacoesSessao().sair);
