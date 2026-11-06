import { ErroTransitorio } from '@pz/integracoes';
import { verificarContratoIa } from '@pz/integracoes/contrato';
import { SystemClock } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DESCRITOR_GEMINI, MODELO_PADRAO_GEMINI, ProvedorIaGemini } from './provedor-ia-gemini.js';
import { subirServidorDeFixtures } from './servidor-de-fixtures.js';

import type { ServidorDeFixtures } from './servidor-de-fixtures.js';

let servidor: ServidorDeFixtures;
const relogio = new SystemClock();
// Chave FICTÍCIA: o servidor local não confere.
const criar = (prefixo = '') =>
  new ProvedorIaGemini(
    { chave: 'chave-ficticia', url: `${servidor.url}${prefixo}/v1beta` },
    relogio,
  );
const prompt = {
  versao: 'v1',
  sistema: 'Instruções e taxonomia (estáveis).',
  mensagens: [{ papel: 'usuario' as const, conteudo: 'Teor FICTÍCIO.' }],
};
const Saida = z.object({ tipoAto: z.string(), confianca: z.number() });

beforeAll(async () => {
  servidor = await subirServidorDeFixtures();
});

afterAll(async () => {
  await servidor.encerrar();
});

verificarContratoIa('Gemini (fixtures)', {
  descritor: DESCRITOR_GEMINI,
  criar: () => criar(),
  criarInalcancavel: () =>
    new ProvedorIaGemini({ chave: 'chave-ficticia', url: 'http://127.0.0.1:1/v1beta' }, relogio),
  criarComLimiteExcedido: () => criar('/limite'),
  criarComCredencialInvalida: () => criar('/credencial'),
  criarComSaidaInvalida: () => criar('/invalida'),
  opcoes: { modelo: MODELO_PADRAO_GEMINI, maxTokensSaida: 256 },
});

describe('requisição enviada ao Gemini (ADR-022)', () => {
  it('chave no cabeçalho, sistema, mensagens e JSON Schema; uso inclui o raciocínio', async () => {
    const antes = servidor.requisicoes.length;
    const r = await criar().gerarEstruturado(prompt, Saida, {
      modelo: MODELO_PADRAO_GEMINI,
      maxTokensSaida: 256,
      temperatura: 0,
    });
    expect(r.saida).toEqual({ tipoAto: 'contestacao', confianca: 0.93 });
    expect(r.modelo).toBe('gemini-3.6-flash');
    expect(r.uso).toEqual({ tokensEntrada: 380, tokensSaida: 106, tokensCacheLidos: 0 });
    const enviada = servidor.requisicoes[antes];
    expect(enviada?.chave).toBe('chave-ficticia');
    expect(enviada?.corpo).toMatchObject({
      systemInstruction: { parts: [{ text: 'Instruções e taxonomia (estáveis).' }] },
      contents: [{ role: 'user', parts: [{ text: 'Teor FICTÍCIO.' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object' },
        maxOutputTokens: 256,
        temperature: 0,
      },
    });
  });

  it('503 de alta demanda é passageiro (o registro tenta de novo)', async () => {
    await expect(
      criar('/sobrecarga').gerarEstruturado(prompt, Saida, {
        modelo: MODELO_PADRAO_GEMINI,
        maxTokensSaida: 256,
      }),
    ).rejects.toBeInstanceOf(ErroTransitorio);
  });
});
