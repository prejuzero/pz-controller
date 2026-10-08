import { ErroSaidaInvalida } from '@pz/integracoes';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { converterResposta, paraRequisicao } from './provedor-ia-anthropic.js';

import type Anthropic from '@anthropic-ai/sdk';

const Saida = z.object({ tipoAto: z.string(), confianca: z.number().max(1) });
const PROMPT = {
  versao: 'v1',
  sistema: 'Instruções fictícias.',
  mensagens: [
    { papel: 'usuario' as const, conteudo: 'Teor FICTÍCIO.' },
    { papel: 'assistente' as const, conteudo: 'Ok.' },
  ],
};

const resposta = (parcial: Partial<Anthropic.Message>): Anthropic.Message =>
  ({
    id: 'msg_ficticio',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content: [{ type: 'text', text: '{"tipoAto":"citacao","confianca":0.9}', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: null,
    },
    ...parcial,
  }) as Anthropic.Message;

describe('conversão da resposta (HU21)', () => {
  it('valida a saída, soma a escrita no cache à entrada e mapeia ferramentas', () => {
    const r = converterResposta(
      resposta({
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'consultar',
            input: { q: 1 },
            caller: { type: 'direct' },
          },
          { type: 'text', text: '{"tipoAto":"citacao","confianca":0.9}', citations: null },
        ] as Anthropic.ContentBlock[],
      }),
      Saida,
    );
    expect(r).toEqual({
      saida: { tipoAto: 'citacao', confianca: 0.9 },
      modelo: 'claude-haiku-4-5',
      uso: { tokensEntrada: 110, tokensSaida: 5, tokensCacheLidos: 0 },
      chamadasDeFerramenta: [{ nome: 'consultar', entrada: { q: 1 } }],
    });
  });

  it.each([
    ['recusa', resposta({ stop_reason: 'refusal' })],
    ['truncada', resposta({ stop_reason: 'max_tokens' })],
    ['não é JSON', resposta({ content: [{ type: 'text', text: 'citação', citations: null }] })],
    [
      'fora do schema',
      resposta({
        content: [{ type: 'text', text: '{"tipoAto":"x","confianca":2}', citations: null }],
      }),
    ],
  ])('%s vira ErroSaidaInvalida', (_caso, r) => {
    expect(() => converterResposta(r, Saida)).toThrow(ErroSaidaInvalida);
  });
});

describe('requisição (HU21)', () => {
  it('sem ferramentas: não envia tools; uso sem campos de cache conta zero', () => {
    expect(paraRequisicao(PROMPT, Saida, { modelo: 'm', maxTokensSaida: 1 })).not.toHaveProperty(
      'tools',
    );
    const r = converterResposta(
      resposta({ usage: { input_tokens: 3, output_tokens: 1 } as Anthropic.Usage }),
      Saida,
    );
    expect(r.uso).toEqual({ tokensEntrada: 3, tokensSaida: 1, tokensCacheLidos: 0 });
  });

  it('sem cache nem temperatura; com ferramentas; papéis e formato', () => {
    const req = paraRequisicao(PROMPT, Saida, {
      modelo: 'claude-haiku-4-5',
      maxTokensSaida: 128,
      ferramentas: [
        { nome: 'consultar', descricao: 'Consulta fictícia', entrada: { properties: {} } },
      ],
    });
    expect(req).not.toHaveProperty('temperature');
    expect(req.system).toEqual([{ type: 'text', text: 'Instruções fictícias.' }]);
    expect(req.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(req.tools).toEqual([
      {
        name: 'consultar',
        description: 'Consulta fictícia',
        input_schema: { type: 'object', properties: {} },
      },
    ]);
    expect(req.output_config?.format).toMatchObject({ type: 'json_schema' });
    expect(
      paraRequisicao(PROMPT, Saida, { modelo: 'm', maxTokensSaida: 1, ferramentas: [] }),
    ).not.toHaveProperty('tools');
  });
});
