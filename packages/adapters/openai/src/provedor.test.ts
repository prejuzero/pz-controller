import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroSaidaInvalida,
  ErroTransitorio,
} from '@pz/integracoes';
import { FixedClock, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { classificarFalhaDeRede, classificarStatusOpenAi } from './erros.js';
import {
  converterRespostaOpenAi,
  paraRequisicaoOpenAi,
  ProvedorIaOpenAi,
} from './provedor-ia-openai.js';

// Prompt, chave e respostas FICTÍCIOS: nada sai para a rede.
const Saida = z.object({ tipoAto: z.string() });
const prompt = {
  versao: 'v1',
  sistema: 'Sistema FICTÍCIO.',
  mensagens: [
    { papel: 'usuario' as const, conteudo: 'Pergunta FICTÍCIA.' },
    { papel: 'assistente' as const, conteudo: 'Resposta FICTÍCIA.' },
  ],
};
const relogio = new FixedClock(Instant.deIso('2026-11-13T12:00:00.000Z'));
const resposta = (conteudo: string | null, extra: Record<string, unknown> = {}) => ({
  model: 'modelo-ficticio-2026',
  choices: [{ finish_reason: 'stop', message: { content: conteudo }, ...extra }],
  usage: { prompt_tokens: 10, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 4 } },
});
const opcoes = { modelo: 'modelo-ficticio', maxTokensSaida: 50, temperatura: 0 };

describe('requisição e conversão da OpenAI (ADR-024)', () => {
  it('sistema primeiro, papéis user/assistant, schema na saída e sem temperatura', () => {
    const corpo = paraRequisicaoOpenAi(prompt, Saida, opcoes);
    expect(corpo.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
    expect(corpo.response_format.type).toBe('json_schema');
    expect(corpo.response_format.json_schema.schema).toMatchObject({ type: 'object' });
    expect(corpo).not.toHaveProperty('temperature');
    expect(corpo.max_completion_tokens).toBe(50);
    expect(() =>
      paraRequisicaoOpenAi(prompt, Saida, {
        ...opcoes,
        ferramentas: [{ nome: 'f', descricao: 'd', entrada: {} }],
      }),
    ).toThrow(ErroPermanente);
  });

  it('resposta válida: saída pelo schema, modelo e uso (com cache lido)', () => {
    expect(converterRespostaOpenAi(resposta('{"tipoAto":"x"}'), Saida, 'pedido')).toEqual({
      saida: { tipoAto: 'x' },
      modelo: 'modelo-ficticio-2026',
      uso: { tokensEntrada: 10, tokensSaida: 3, tokensCacheLidos: 4 },
      chamadasDeFerramenta: [],
    });
    const semUso = converterRespostaOpenAi(
      { choices: [{ message: { content: '{"tipoAto":"y"}' } }] },
      Saida,
      'pedido',
    );
    expect(semUso.modelo).toBe('pedido');
    expect(semUso.uso).toEqual({ tokensEntrada: 0, tokensSaida: 0, tokensCacheLidos: 0 });
  });

  it.each([
    ['formato da API', 'texto'],
    ['truncada', resposta('{}', { finish_reason: 'length' })],
    ['recusa', resposta(null, { message: { content: null, refusal: 'não' } })],
    ['filtro', resposta('{}', { finish_reason: 'content_filter' })],
    ['sem escolha', { choices: [] }],
    ['não JSON', resposta('isto não é json')],
    ['fora do schema', resposta('{"outro":1}')],
  ])('saída inválida: %s', (_caso, bruta) => {
    expect(() => converterRespostaOpenAi(bruta, Saida, 'pedido')).toThrow(ErroSaidaInvalida);
  });
});

describe('erros e chamadas da OpenAI', () => {
  it('classifica pelo status e a falha de rede como passageira', () => {
    expect(classificarStatusOpenAi(401)).toBeInstanceOf(ErroCredencialInvalida);
    expect(classificarStatusOpenAi(403)).toBeInstanceOf(ErroCredencialInvalida);
    expect(classificarStatusOpenAi(429)).toBeInstanceOf(ErroLimiteExcedido);
    expect(classificarStatusOpenAi(503)).toBeInstanceOf(ErroTransitorio);
    expect(classificarStatusOpenAi(408)).toBeInstanceOf(ErroTransitorio);
    expect(classificarStatusOpenAi(400)).toBeInstanceOf(ErroPermanente);
    expect(classificarFalhaDeRede(new Error('x'))).toBeInstanceOf(ErroTransitorio);
  });

  it('envia a chave no cabeçalho, nunca na URL; saúde pelo /models', async () => {
    const pedidos: { url: string; auth: string | null }[] = [];
    const falso = (status: number, corpo: unknown) =>
      ((url: string, init?: RequestInit) => {
        pedidos.push({ url, auth: new Headers(init?.headers).get('authorization') });
        return Promise.resolve(new Response(JSON.stringify(corpo), { status }));
      }) as typeof fetch;
    const provedor = new ProvedorIaOpenAi(
      {
        chave: 'chave-ficticia',
        url: 'http://openai.local/v1/',
        fetch: falso(200, resposta('{"tipoAto":"z"}')),
      },
      relogio,
    );
    const r = await provedor.gerarEstruturado(prompt, Saida, opcoes);
    expect(r.saida).toEqual({ tipoAto: 'z' });
    expect(pedidos[0]).toEqual({
      url: 'http://openai.local/v1/chat/completions',
      auth: 'Bearer chave-ficticia',
    });
    expect((await provedor.saude()).estado).toBe('operacional');
    expect(pedidos[1]?.url).toBe('http://openai.local/v1/models');

    const negado = new ProvedorIaOpenAi({ chave: 'c', fetch: falso(400, {}) }, relogio);
    expect((await negado.saude()).estado).toBe('degradado');
    await expect(negado.gerarEstruturado(prompt, Saida, opcoes)).rejects.toThrow(ErroPermanente);
    const fora = new ProvedorIaOpenAi(
      { chave: 'c', fetch: () => Promise.reject(new Error('rede')) },
      relogio,
    );
    expect((await fora.saude()).estado).toBe('indisponivel');
    const naoJson = new ProvedorIaOpenAi(
      { chave: 'c', fetch: () => Promise.resolve(new Response('<html>')) },
      relogio,
    );
    await expect(naoJson.gerarEstruturado(prompt, Saida, opcoes)).rejects.toThrow(
      ErroSaidaInvalida,
    );
  });
});
