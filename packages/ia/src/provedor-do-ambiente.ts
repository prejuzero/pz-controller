import { comProvedores } from './configuracao.js';

import type { ConfiguracaoDasTarefas, PrecoDoModelo } from './configuracao.js';
import type { Logger } from '@pz/observability';

export const PROVEDORES_DE_IA = ['anthropic', 'openai', 'gemini'] as const;
export type ProvedorDeIa = (typeof PROVEDORES_DE_IA)[number];

/** Variáveis de ambiente que escolhem os provedores de IA (as mesmas na API e no worker). */
export interface AmbienteDaIa {
  /** Ordem de preferência; o primeiro disponível atende e os seguintes são o fallback. */
  readonly IA_PROVEDORES: readonly ProvedorDeIa[];
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly OPENAI_API_KEY?: string | undefined;
  readonly OPENAI_MODELO: string;
  readonly GEMINI_API_KEY?: string | undefined;
  readonly GEMINI_MODELO: string;
  /** "pago": faturamento ativo no projeto do Google, sem uso dos dados para treino (ADR-024). */
  readonly GEMINI_PLANO: 'gratuito' | 'pago';
  readonly IA_DADOS_FICTICIOS: 'sim' | 'nao';
}

export type ProvedorIaEscolhido =
  | { tipo: 'anthropic'; chave: string }
  | { tipo: 'openai'; chave: string; modelo: string }
  | { tipo: 'gemini'; chave: string; modelo: string; plano: 'gratuito' | 'pago' };

/**
 * Provedores de IA do ambiente, na ordem de `IA_PROVEDORES` (ADR-022, ADR-024). Entra só o que
 * tem chave e pode receber o conteúdo: Anthropic e OpenAI pela API (sem uso dos dados para
 * treino); Gemini no plano pago ou, no gratuito, só com a declaração de dados fictícios (o plano
 * gratuito pode usar o conteúdo para treino: CLAUDE.md, seção 11). Nenhum: lista vazia e a IA
 * fica desligada (só regras rápidas).
 */
export function escolherProvedoresIa(
  ambiente: AmbienteDaIa,
  logger: Pick<Logger, 'warn'>,
): ProvedorIaEscolhido[] {
  const escolhidos: ProvedorIaEscolhido[] = [];
  for (const tipo of new Set(ambiente.IA_PROVEDORES)) {
    if (tipo === 'anthropic' && ambiente.ANTHROPIC_API_KEY !== undefined) {
      escolhidos.push({ tipo, chave: ambiente.ANTHROPIC_API_KEY });
    }
    if (tipo === 'openai' && ambiente.OPENAI_API_KEY !== undefined) {
      escolhidos.push({ tipo, chave: ambiente.OPENAI_API_KEY, modelo: ambiente.OPENAI_MODELO });
    }
    if (tipo === 'gemini' && ambiente.GEMINI_API_KEY !== undefined) {
      if (ambiente.GEMINI_PLANO === 'gratuito' && ambiente.IA_DADOS_FICTICIOS !== 'sim') {
        logger.warn(
          'GEMINI_API_KEY no plano gratuito sem IA_DADOS_FICTICIOS=sim: Gemini não ligado (o plano gratuito pode usar os dados para treino)',
        );
        continue;
      }
      escolhidos.push({
        tipo,
        chave: ambiente.GEMINI_API_KEY,
        modelo: ambiente.GEMINI_MODELO,
        plano: ambiente.GEMINI_PLANO,
      });
    }
  }
  if (escolhidos.length === 0) logger.warn('sem provedor de IA: IA desligada (só regras rápidas)');
  else if (escolhidos.some((e) => e.tipo === 'gemini' && e.plano === 'gratuito')) {
    logger.warn('IA pelo Gemini gratuito (ADR-022): só para validação local com dados fictícios');
  }
  return escolhidos;
}

/** O primeiro provedor disponível (compatibilidade com quem só precisa de um). */
export function escolherProvedorIa(
  ambiente: AmbienteDaIa,
  logger: Pick<Logger, 'warn'>,
): ProvedorIaEscolhido | undefined {
  return escolherProvedoresIa(ambiente, logger)[0];
}

/**
 * Preço de tabela do modelo fora da configuração padrão: sem fonte oficial cadastrada, zero, e o
 * orçamento mensal em tokens por tarefa continua limitando o uso (PZ-302).
 */
const SEM_PRECO: PrecoDoModelo = { entrada: 0, saida: 0, cacheLido: 0 };

/**
 * Configuração das tarefas para os provedores escolhidos, na ordem: Anthropic usa os modelos da
 * configuração padrão de cada tarefa; OpenAI e Gemini, o modelo configurado. A plataforma tenta o
 * próximo quando um falha (fallback).
 */
export function configuracaoDosProvedores(
  base: ConfiguracaoDasTarefas,
  escolhidos: readonly ProvedorIaEscolhido[],
): ConfiguracaoDasTarefas {
  return comProvedores(
    base,
    escolhidos.map((e) =>
      e.tipo === 'anthropic'
        ? { provedor: 'anthropic' as const }
        : {
            provedor: e.tipo,
            modelo: e.modelo,
            preco: SEM_PRECO,
            fonteDoPreco: `${e.tipo}: preço não cadastrado (orçamento em tokens)`,
          },
    ),
  );
}
