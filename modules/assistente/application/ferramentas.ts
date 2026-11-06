import {
  DetalheDoPrazo,
  FiltrosBusca,
  PedidoDePrazoManual,
  Prazo,
  ProcessoDoTenant,
  ResultadoDaBuscaDePrazos,
  ResultadoDaBuscaDePublicacoes,
} from '@pz/contracts';
import { z } from 'zod';

import type { ContextoDaFerramenta, Ferramenta } from '@pz/ia';
import type { ErroDominio, Result } from '@pz/kernel';

type Entrada<E extends z.ZodType> = z.output<E>;
type Saida<E extends { esquema: z.ZodType }> = z.infer<E['esquema']>;

/** Entrada da simulação: o pedido do prazo manual, sem o que só a tela de cadastro usa. */
const EntradaDaSimulacao = PedidoDePrazoManual.esquema
  .omit({ origem: true, observacao: true, documento: true, vencimentoConfirmado: true })
  .strict();
const EntradaPorId = z.object({ id: z.uuid() }).strict();

/**
 * O que as ferramentas leem dos outros módulos, pelas APIs públicas deles (composto na api). Cada
 * chamada roda no tenant do contexto (RLS): o tenant nunca vem do modelo.
 */
export interface FontesDasFerramentas {
  buscarPrazos(
    filtros: z.input<typeof FiltrosBusca.esquema>,
    contexto: ContextoDaFerramenta,
  ): Promise<Result<Saida<typeof ResultadoDaBuscaDePrazos>, ErroDominio>>;
  buscarPublicacoes(
    filtros: z.input<typeof FiltrosBusca.esquema>,
    contexto: ContextoDaFerramenta,
  ): Promise<Result<Saida<typeof ResultadoDaBuscaDePublicacoes>, ErroDominio>>;
  consultarProcesso(
    id: string,
    contexto: ContextoDaFerramenta,
  ): Promise<Result<Saida<typeof ProcessoDoTenant>, ErroDominio>>;
  /** Prévia pelo motor de prazos, sem gravar (a data nunca vem da IA, ADR-008). */
  simularPrazo(
    pedido: Entrada<typeof EntradaDaSimulacao>,
    contexto: ContextoDaFerramenta,
  ): Promise<Result<Saida<typeof Prazo>, ErroDominio>>;
  consultarPrazo(
    id: string,
    contexto: ContextoDaFerramenta,
  ): Promise<Result<Saida<typeof DetalheDoPrazo>, ErroDominio>>;
}

/**
 * Ferramentas iniciais do catálogo (HU59), só de leitura. Entrada e saída pelos mesmos schemas da
 * API: a IA vê o que o portal vê, com a mesma permissão. `consultar_base_juridica` entra com a
 * base jurídica (HU48).
 */
export function ferramentasDoAssistente(fontes: FontesDasFerramentas) {
  const buscarPrazos: Ferramenta<
    z.output<typeof FiltrosBusca.esquema>,
    Saida<typeof ResultadoDaBuscaDePrazos>
  > = {
    nome: 'buscar_prazos',
    descricao:
      'Busca prazos do escritório com filtros combinados (número do processo, cliente, tribunal, tipo de ato, situação, ciência, responsável, OAB, período). Use para perguntas sobre prazos.',
    permissao: 'prazos:ler',
    alteraEstado: false,
    entrada: FiltrosBusca.esquema,
    saida: ResultadoDaBuscaDePrazos.esquema,
    executar: (filtros, contexto) => fontes.buscarPrazos(filtros, contexto),
  };
  const buscarPublicacoes: Ferramenta<
    z.output<typeof FiltrosBusca.esquema>,
    Saida<typeof ResultadoDaBuscaDePublicacoes>
  > = {
    nome: 'buscar_publicacoes',
    descricao:
      'Busca publicações (intimações) recebidas pelo escritório, por processo, cliente, tribunal, palavra-chave no teor ou período de disponibilização.',
    permissao: 'publicacoes:ler',
    alteraEstado: false,
    entrada: FiltrosBusca.esquema,
    saida: ResultadoDaBuscaDePublicacoes.esquema,
    executar: (filtros, contexto) => fontes.buscarPublicacoes(filtros, contexto),
  };
  const consultarProcesso: Ferramenta<{ id: string }, Saida<typeof ProcessoDoTenant>> = {
    nome: 'consultar_processo',
    descricao:
      'Dados de um processo do escritório pelo id: número CNJ, tribunal, comarca, cliente, sigilo e cobertura da captura.',
    permissao: 'processos:ler',
    alteraEstado: false,
    entrada: EntradaPorId,
    saida: ProcessoDoTenant.esquema,
    executar: ({ id }, contexto) => fontes.consultarProcesso(id, contexto),
  };
  const simularPrazo: Ferramenta<Entrada<typeof EntradaDaSimulacao>, Saida<typeof Prazo>> = {
    nome: 'simular_prazo',
    descricao:
      'Calcula pelo motor de prazos, sem gravar, o vencimento de um ato num processo, a partir do meio e da data de referência informados. Nunca estime datas por conta própria: use esta ferramenta.',
    permissao: 'prazos:ler',
    alteraEstado: false,
    entrada: EntradaDaSimulacao,
    saida: Prazo.esquema,
    executar: (pedido, contexto) => fontes.simularPrazo(pedido, contexto),
  };
  const explicarMemoria: Ferramenta<{ id: string }, Saida<typeof DetalheDoPrazo>> = {
    nome: 'explicar_memoria_calculo',
    descricao:
      'Memória de cálculo de um prazo pelo id: data considerada, início, cada dia desconsiderado com o motivo e o ato normativo, e os dispositivos aplicados. Use para explicar como a data foi calculada.',
    permissao: 'prazos:ler',
    alteraEstado: false,
    entrada: EntradaPorId,
    saida: DetalheDoPrazo.esquema,
    executar: ({ id }, contexto) => fontes.consultarPrazo(id, contexto),
  };
  return [buscarPrazos, buscarPublicacoes, consultarProcesso, simularPrazo, explicarMemoria];
}
