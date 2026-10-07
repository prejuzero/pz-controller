'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

import { permite, type Exigencia } from '../permissoes';

import { consultasCalendario, mutacoesCalendario } from './calendario';
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

/** Permissões efetivas da sessão; `undefined` enquanto a sessão carrega. */
export function usePermissoes(): readonly string[] | undefined {
  return useSessao().data?.permissoes;
}

/** `undefined` enquanto a sessão carrega: nem mostra a ação nem o aviso de acesso negado. */
export function usePermissao(exigencia: Exigencia): boolean | undefined {
  const permissoes = usePermissoes();
  return permissoes === undefined ? undefined : permite(permissoes, exigencia);
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

function useMutacoesCalendario() {
  return mutacoesCalendario(useApi(), useQueryClient());
}

export const useCalendarioGlobal = (ano: number) =>
  useQuery(consultasCalendario(useApi()).global(ano));
export const useFeriadosLocais = (ano: number) =>
  useQuery(consultasCalendario(useApi()).locais(ano));
export const useProporEvento = () => useMutation(useMutacoesCalendario().propor);
export const useAprovarEvento = () => useMutation(useMutacoesCalendario().aprovar);
export const useRevogarEvento = () => useMutation(useMutacoesCalendario().revogar);
export const useImportarCalendario = () => useMutation(useMutacoesCalendario().importar);
export const useCadastrarFeriadoLocal = () => useMutation(useMutacoesCalendario().cadastrarLocal);
export const useRevogarFeriadoLocal = () => useMutation(useMutacoesCalendario().revogarLocal);
