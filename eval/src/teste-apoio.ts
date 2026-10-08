import { ErroPermanente, ErroTransitorio } from '@pz/integracoes';
import { FixedClock, Instant } from '@pz/kernel';

import type { CasoDeAvaliacao } from './caso.js';
import type { Referencia } from './referencia.js';
import type { OpcoesIA, PromptIA, ProvedorIA, RespostaIA } from '@pz/integracoes';
import type { z } from 'zod';

/** Apoio dos testes do runner (não entra no conjunto nem na cobertura). */
export const relogio = new FixedClock(Instant.deEpochMs(Date.UTC(2026, 9, 8, 12)));

export function caso(
  id: string,
  teor: string,
  tipoAto: string,
  extra: Partial<CasoDeAvaliacao> = {},
): CasoDeAvaliacao {
  return {
    id,
    origem: 'real-anonimizado',
    ramo: 'civel',
    teor,
    anotacao: { tipoAto, trecho: '', prazoCitado: null },
    anotador: 'adv-01',
    revisor: 'adv-02',
    anonimizacaoConferidaPor: 'adv-02',
    ...extra,
  };
}

export const referencia: Referencia = {
  taxonomia: {
    versao: 't1',
    provisoria: false,
    observacao: '',
    tipos: [
      { codigo: 'citacao', nome: 'Citação', descricao: '' },
      { codigo: 'sentenca', nome: 'Sentença', descricao: '' },
      { codigo: 'intimacao-manifestacao', nome: 'Manifestação', descricao: '' },
    ],
  },
  regras: {
    versao: 'r1',
    provisoria: false,
    observacao: '',
    regras: [
      {
        codigo: 'r-citacao',
        versao: 1,
        tipoAto: 'citacao',
        padroes: ['\\bcite-se\\b'],
        confianca: 0.95,
      },
    ],
  },
};

/**
 * Provedor de mentira: responde pela primeira palavra-chave encontrada no prompt. "QUEBRA" no
 * teor dá saída inválida; "REDE" dá falha transitória.
 */
export class ProvedorDeMentira implements ProvedorIA {
  readonly modelos: string[] = [];

  /** `regredido`: simula um prompt pior, que não reconhece mais nenhum ato. */
  constructor(private readonly regredido = false) {}

  gerarEstruturado<Saida>(
    prompt: PromptIA,
    schema: z.ZodType<Saida>,
    opcoes: OpcoesIA,
  ): Promise<RespostaIA<Saida>> {
    this.modelos.push(opcoes.modelo);
    const texto = prompt.mensagens.map((m) => m.conteudo).join('\n');
    if (texto.includes('QUEBRA')) return Promise.reject(new ErroPermanente('fora do schema', 'ia'));
    if (texto.includes('REDE')) return Promise.reject(new ErroTransitorio('caiu', 'ia'));
    const saida =
      !this.regredido && texto.includes('Intime-se')
        ? { tipoAto: 'intimacao-manifestacao', confianca: 0.97, trecho: 'Intime-se' }
        : { tipoAto: 'desconhecido', confianca: 0.4, trecho: '' };
    return Promise.resolve({
      saida: schema.parse(saida),
      modelo: opcoes.modelo,
      uso: { tokensEntrada: 1000, tokensSaida: 100, tokensCacheLidos: 0 },
      chamadasDeFerramenta: [],
    });
  }

  saude() {
    return Promise.resolve({ estado: 'operacional' as const, verificadoEm: relogio.agora() });
  }
}
