import { ErroLimiteExcedido } from '@pz/integracoes';
import { FixedClock, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { MODELO_PADRAO, ProvedorIaAnthropic } from './provedor-ia-anthropic.js';
import { subirServidorDeFixtures } from './servidor-de-fixtures.js';

import type { ServidorDeFixtures } from './servidor-de-fixtures.js';

const relogio = new FixedClock(Instant.deIso('2026-10-08T12:00:00Z'));
let servidor: ServidorDeFixtures;
const criar = (prefixo = '') =>
  new ProvedorIaAnthropic({ chave: 'chave-ficticia', url: `${servidor.url}${prefixo}` }, relogio);
const PROMPT = {
  versao: 'v1',
  sistema: 'S',
  mensagens: [{ papel: 'usuario' as const, conteudo: 'T' }],
};

beforeAll(async () => {
  servidor = await subirServidorDeFixtures();
});
afterAll(async () => {
  await servidor.encerrar();
});

describe('ProvedorIaAnthropic contra o servidor local (HU21)', () => {
  it('gera saída estruturada e classifica a cota', async () => {
    const schema = z.object({ tipoAto: z.string(), confianca: z.number() });
    const opcoes = { modelo: MODELO_PADRAO, maxTokensSaida: 64 };
    expect((await criar().gerarEstruturado(PROMPT, schema, opcoes)).saida.tipoAto).toBe('citacao');
    await expect(criar('/limite').gerarEstruturado(PROMPT, schema, opcoes)).rejects.toBeInstanceOf(
      ErroLimiteExcedido,
    );
  });

  it('sem URL usa o endereço padrão do SDK (sem chamar a rede aqui)', () => {
    expect(new ProvedorIaAnthropic({ chave: 'chave-ficticia' }, relogio)).toBeInstanceOf(
      ProvedorIaAnthropic,
    );
  });

  it('saúde: operacional, degradada (erro permanente) e indisponível (credencial)', async () => {
    expect(await criar().saude()).toEqual({ estado: 'operacional', verificadoEm: relogio.agora() });
    expect((await criar('/inexistente').saude()).estado).toBe('degradado');
    expect((await criar('/credencial').saude()).estado).toBe('indisponivel');
  });
});
