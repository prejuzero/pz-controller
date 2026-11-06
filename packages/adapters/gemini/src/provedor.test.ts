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

import { classificarFalhaDeRede, classificarStatusGemini } from './erros.js';
import {
  converterRespostaGemini,
  paraRequisicaoGemini,
  ProvedorIaGemini,
} from './provedor-ia-gemini.js';

const Saida = z.object({ tipoAto: z.string() });
const prompt = {
  versao: 'v1',
  sistema: 'Sistema FICTÍCIO.',
  mensagens: [
    { papel: 'usuario' as const, conteudo: 'Pergunta FICTÍCIA.' },
    { papel: 'assistente' as const, conteudo: 'Resposta FICTÍCIA.' },
  ],
};
const relogio = new FixedClock(Instant.deIso('2026-11-06T12:00:00.000Z'));
const resposta = (texto: string, extra: Record<string, unknown> = {}) => ({
  candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP', ...extra }],
});

describe('requisição e conversão do Gemini', () => {
  it('papéis viram user/model; ferramentas são recusadas', () => {
    const corpo = paraRequisicaoGemini(prompt, Saida, { modelo: 'm', maxTokensSaida: 10 });
    expect(corpo.contents.map((c) => c.role)).toEqual(['user', 'model']);
    expect(corpo.generationConfig).not.toHaveProperty('temperature');
    expect(() =>
      paraRequisicaoGemini(prompt, Saida, {
        modelo: 'm',
        maxTokensSaida: 10,
        ferramentas: [{ nome: 'f', descricao: 'd', entrada: {} }],
      }),
    ).toThrow(ErroPermanente);
  });

  it('resposta válida, sem uso informado: zeros e o modelo pedido', () => {
    const r = converterRespostaGemini(resposta('{"tipoAto":"x"}'), Saida, 'modelo-pedido');
    expect(r).toEqual({
      saida: { tipoAto: 'x' },
      modelo: 'modelo-pedido',
      uso: { tokensEntrada: 0, tokensSaida: 0, tokensCacheLidos: 0 },
      chamadasDeFerramenta: [],
    });
  });

  it.each([
    ['fora do formato', { candidates: 'x' }],
    ['prompt bloqueado', { promptFeedback: { blockReason: 'SAFETY' } }],
    ['sem candidato', {}],
    ['truncada', resposta('{', { finishReason: 'MAX_TOKENS' })],
    ['filtrada', resposta('{}', { finishReason: 'SAFETY' })],
    ['não é JSON', resposta('texto solto')],
    ['fora do schema', resposta('{"outro":1}')],
  ])('%s vira ErroSaidaInvalida', (_nome, bruta) => {
    expect(() => converterRespostaGemini(bruta, Saida, 'm')).toThrow(ErroSaidaInvalida);
  });

  it('classifica status e rede', () => {
    expect(classificarStatusGemini(401, '')).toBeInstanceOf(ErroCredencialInvalida);
    expect(classificarStatusGemini(403, '{}')).toBeInstanceOf(ErroCredencialInvalida);
    expect(classificarStatusGemini(429, '{}')).toBeInstanceOf(ErroLimiteExcedido);
    expect(classificarStatusGemini(503, '{}')).toBeInstanceOf(ErroTransitorio);
    expect(classificarStatusGemini(408, '')).toBeInstanceOf(ErroTransitorio);
    expect(classificarStatusGemini(404, '')).toBeInstanceOf(ErroTransitorio);
    expect(classificarStatusGemini(404, '{"error":{}}')).toBeInstanceOf(ErroPermanente);
    expect(classificarStatusGemini(400, '{}')).toBeInstanceOf(ErroPermanente);
    expect(classificarFalhaDeRede(new Error('x'))).toBeInstanceOf(ErroTransitorio);
  });
});

describe('ProvedorIaGemini com fetch simulado', () => {
  const comFetch = (impl: typeof fetch) =>
    new ProvedorIaGemini({ chave: 'chave-ficticia', fetch: impl }, relogio);

  it('saúde: operacional, degradado (credencial) e indisponível (rede)', async () => {
    const ok = comFetch(() => Promise.resolve(new Response('{}', { status: 200 })));
    expect((await ok.saude()).estado).toBe('operacional');
    const negado = comFetch(() => Promise.resolve(new Response('{}', { status: 400 })));
    expect((await negado.saude()).estado).toBe('degradado');
    const fora = comFetch(() => Promise.reject(new Error('rede')));
    expect((await fora.saude()).estado).toBe('indisponivel');
  });

  it('resposta 200 que não é JSON vira ErroSaidaInvalida', async () => {
    const provedor = comFetch(() => Promise.resolve(new Response('<html>', { status: 200 })));
    await expect(
      provedor.gerarEstruturado(prompt, Saida, { modelo: 'm', maxTokensSaida: 10 }),
    ).rejects.toBeInstanceOf(ErroSaidaInvalida);
  });

  it('chamada completa: URL sem barra dupla, cabeçalho da chave, uso com cache e raciocínio', async () => {
    const pedidos: { url: string; init: RequestInit | undefined }[] = [];
    const provedor = new ProvedorIaGemini(
      {
        chave: 'chave-ficticia',
        url: 'http://exemplo.invalid/v1beta/',
        fetch: (url, init) => {
          pedidos.push({
            url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
            init,
          });
          return Promise.resolve(
            new Response(
              JSON.stringify({
                candidates: [{ content: { parts: [{ text: '{"tipoAto":"y"}' }] } }],
                usageMetadata: {
                  promptTokenCount: 10,
                  candidatesTokenCount: 3,
                  thoughtsTokenCount: 2,
                  cachedContentTokenCount: 4,
                },
                modelVersion: 'versao-ficticia',
              }),
              { status: 200 },
            ),
          );
        },
      },
      relogio,
    );
    const r = await provedor.gerarEstruturado(prompt, Saida, {
      modelo: 'modelo ficticio',
      maxTokensSaida: 10,
      temperatura: 0.2,
    });
    expect(r).toMatchObject({
      saida: { tipoAto: 'y' },
      modelo: 'versao-ficticia',
      uso: { tokensEntrada: 10, tokensSaida: 5, tokensCacheLidos: 4 },
    });
    expect(pedidos[0]?.url).toBe(
      'http://exemplo.invalid/v1beta/models/modelo%20ficticio:generateContent',
    );
    expect(pedidos[0]?.init?.headers).toMatchObject({ 'x-goog-api-key': 'chave-ficticia' });
  });

  it('saúde com falha que não é Error: detalhe genérico', async () => {
    const estranho = new ProvedorIaGemini(
      {
        chave: 'chave-ficticia',
        fetch: () =>
          Promise.resolve({
            ok: false,
            status: 500,
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- o teste cobre justamente uma falha que não é Error.
            text: () => Promise.reject('x'),
          } as unknown as Response),
      },
      relogio,
    );
    const saude = await estranho.saude();
    expect(saude.estado).toBe('indisponivel');
    expect(saude.detalhe).toBe('Gemini: erro desconhecido');
  });
});
