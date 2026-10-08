import { verificarContratoIa } from '@pz/integracoes/contrato';
import { SystemClock } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DESCRITOR_ANTHROPIC,
  MODELO_PADRAO,
  ProvedorIaAnthropic,
} from './provedor-ia-anthropic.js';
import { subirServidorDeFixtures } from './servidor-de-fixtures.js';

import type { ServidorDeFixtures } from './servidor-de-fixtures.js';

let servidor: ServidorDeFixtures;
const relogio = new SystemClock();
// Chave FICTÍCIA: o servidor local não confere.
const criar = (prefixo = '') =>
  new ProvedorIaAnthropic({ chave: 'chave-ficticia', url: `${servidor.url}${prefixo}` }, relogio);

beforeAll(async () => {
  servidor = await subirServidorDeFixtures();
});

afterAll(async () => {
  await servidor.encerrar();
});

verificarContratoIa('Anthropic (fixtures)', {
  descritor: DESCRITOR_ANTHROPIC,
  criar: () => criar(),
  criarInalcancavel: () =>
    new ProvedorIaAnthropic({ chave: 'chave-ficticia', url: 'http://127.0.0.1:1' }, relogio),
  criarComLimiteExcedido: () => criar('/limite'),
  criarComCredencialInvalida: () => criar('/credencial'),
  criarComSaidaInvalida: () => criar('/invalida'),
  opcoes: { modelo: MODELO_PADRAO, maxTokensSaida: 256, cachePrompt: true },
});

describe('requisição enviada à Anthropic (HU21)', () => {
  it('modelo, sistema com cache, formato JSON Schema e uso com cache lido', async () => {
    const antes = servidor.requisicoes.length;
    const r = await criar().gerarEstruturado(
      {
        versao: 'v1',
        sistema: 'Instruções e taxonomia (estáveis).',
        mensagens: [{ papel: 'usuario', conteudo: 'Teor FICTÍCIO.' }],
      },
      z.object({ tipoAto: z.string(), confianca: z.number() }),
      { modelo: MODELO_PADRAO, maxTokensSaida: 256, cachePrompt: true, temperatura: 0 },
    );
    expect(r.uso).toEqual({ tokensEntrada: 412, tokensSaida: 18, tokensCacheLidos: 2048 });
    expect(servidor.requisicoes[antes]).toMatchObject({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      temperature: 0,
      system: [{ type: 'text', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'Teor FICTÍCIO.' }],
      output_config: { format: { type: 'json_schema', schema: { type: 'object' } } },
    });
  });
});
