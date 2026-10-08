'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

import { permite, type Exigencia } from '../permissoes';

import { consultasCadastro, mutacoesCadastro } from './cadastro';
import { consultasCalendario, mutacoesCalendario } from './calendario';
import { consultasNotificacoes } from './notificacoes';
import { consultasPrivacidade, mutacoesPrivacidade } from './privacidade';
import { consultasProcessos, mutacoesProcessos, type FiltrosProcessos } from './processos';
import { consultasPublicacoes, mutacoesPublicacoes, type FiltrosPublicacoes } from './publicacoes';
import { consultasSessao, mutacoesSessao } from './sessao';
import { consultasTabelaPrazos, mutacoesTabelaPrazos } from './tabela-prazos';

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

function useMutacoesPrivacidade() {
  return mutacoesPrivacidade(useApi(), useQueryClient());
}

export const useDocumentosVigentes = () => useQuery(consultasPrivacidade(useApi()).vigentes());
export const useTermosPendentes = () => useQuery(consultasPrivacidade(useApi()).pendentes());
export const useAceites = () => useQuery(consultasPrivacidade(useApi()).aceites());
export const useExportacao = (id: string) =>
  useQuery(consultasPrivacidade(useApi()).exportacao(id));
export const useEncerramento = () => useQuery(consultasPrivacidade(useApi()).encerramento());
export const useAceitarTermos = () => useMutation(useMutacoesPrivacidade().aceitar);
export const useExportarDados = () => useMutation(useMutacoesPrivacidade().exportar);
export const useEncerrarConta = () => useMutation(useMutacoesPrivacidade().encerrar);
export const useCancelarEncerramento = () =>
  useMutation(useMutacoesPrivacidade().cancelarEncerramento);

function useMutacoesTabelaPrazos() {
  return mutacoesTabelaPrazos(useApi(), useQueryClient());
}

export const useTiposDeAto = () => useQuery(consultasTabelaPrazos(useApi()).tiposDeAto());
export const useVersoesDaTabela = () => useQuery(consultasTabelaPrazos(useApi()).versoes());
export const useCadastrarTipoDeAto = () => useMutation(useMutacoesTabelaPrazos().cadastrarTipo);
export const useProporVersao = () => useMutation(useMutacoesTabelaPrazos().propor);
export const useAprovarVersao = () => useMutation(useMutacoesTabelaPrazos().aprovar);

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

function useMutacoesCadastro() {
  return mutacoesCadastro(useApi(), useQueryClient());
}

export const usePerfil = () => useQuery(consultasCadastro(useApi()).perfil());

/** Avisos de entrega da faixa do topo (HU30); só com a sessão completa (`conta:gerir`). */
export function useAvisosDeEntrega() {
  const habilitado = usePermissao('conta:gerir') === true;
  return useQuery({ ...consultasNotificacoes(useApi()).avisos(), enabled: habilitado });
}
export const useCadastrar = () => useMutation(useMutacoesCadastro().cadastrar);
export const useVerificarEmail = () => useMutation(useMutacoesCadastro().verificarEmail);
export const useAtualizarPerfil = () => useMutation(useMutacoesCadastro().atualizarPerfil);
export const useAdicionarOab = () => useMutation(useMutacoesCadastro().adicionarOab);
export const useRemoverOab = () => useMutation(useMutacoesCadastro().removerOab);

function useMutacoesProcessos() {
  return mutacoesProcessos(useApi(), useQueryClient());
}

export const useProcessos = (filtros: FiltrosProcessos) =>
  useInfiniteQuery(consultasProcessos(useApi()).lista(filtros));
export const useProcesso = (id: string) => useQuery(consultasProcessos(useApi()).detalhe(id));
export const useClientes = () => useQuery(consultasProcessos(useApi()).clientes());
export const useCadastrarProcesso = () => useMutation(useMutacoesProcessos().cadastrar);
export const useAtualizarProcesso = () => useMutation(useMutacoesProcessos().atualizar);
export const useAlterarCobertura = () => useMutation(useMutacoesProcessos().alterarCobertura);
export const useCadastrarCliente = () => useMutation(useMutacoesProcessos().cadastrarCliente);
export const useAtualizarCliente = () => useMutation(useMutacoesProcessos().atualizarCliente);
export const useRemoverCliente = () => useMutation(useMutacoesProcessos().removerCliente);

export const usePublicacoes = (filtros: FiltrosPublicacoes) =>
  useInfiniteQuery(consultasPublicacoes(useApi()).lista(filtros));
export const usePublicacao = (id: string) => useQuery(consultasPublicacoes(useApi()).detalhe(id));
export const useMarcarPublicacaoLida = () =>
  useMutation(mutacoesPublicacoes(useApi(), useQueryClient()).marcarLida);
