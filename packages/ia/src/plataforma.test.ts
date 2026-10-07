import { readFileSync } from 'node:fs';

import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from '@pz/integracoes';
import { Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { lerConfiguracaoDasTarefas } from './configuracao.js';
import { PlataformaIa } from './plataforma.js';

import type { OpcoesIA, PromptIA, ProvedorIA } from '@pz/integracoes';

const prompt: PromptIA = {
  versao: 'teste@1',
  sistema: 'Classifique o ato (FICTÍCIO).',
  mensagens: [{ papel: 'usuario', conteudo: 'Texto fictício.' }],
};
const Saida = z.object({ tipoAto: z.string() });

const configuracao = lerConfiguracaoDasTarefas({
  versao: 'teste',
  tarefas: {
    classificar: {
      descricao: 'teste',
      modelos: [
        { provedor: 'a', modelo: 'modelo-a1' },
        { provedor: 'a', modelo: 'modelo-a2' },
        { provedor: 'b', modelo: 'modelo-b1' },
      ],
      temperatura: 0,
      maxTokensSaida: 100,
      cachePrompt: true,
      lote: true,
    },
    resumir: {
      descricao: 'teste',
      modelos: [{ provedor: 'b', modelo: 'modelo-b1' }],
      maxTokensSaida: 50,
      cachePrompt: false,
      lote: false,
    },
  },
});

/** Provedor falso: falha nos modelos indicados e registra as opções recebidas. */
function provedor(falhas: Record<string, Error> = {}, comLote = false) {
  const chamadas: OpcoesIA[] = [];
  const falso: ProvedorIA & { chamadas: OpcoesIA[] } = {
    chamadas,
    gerarEstruturado<S>(_prompt: PromptIA, schema: z.ZodType<S>, opcoes: OpcoesIA) {
      chamadas.push(opcoes);
      const erro = falhas[opcoes.modelo];
      if (erro !== undefined) return Promise.reject(erro);
      return Promise.resolve({
        saida: schema.parse({ tipoAto: 'ficticio' }),
        modelo: opcoes.modelo,
        uso: { tokensEntrada: 10, tokensSaida: 2, tokensCacheLidos: 8 },
        chamadasDeFerramenta: [],
      });
    },
    saude: () => Promise.resolve({ estado: 'operacional', verificadoEm: Instant.deEpochMs(0) }),
    ...(comLote ? { enviarLote: () => Promise.resolve('lote-1') } : {}),
  };
  return falso;
}

describe('PlataformaIa (HU58)', () => {
  it('usa o modelo primário com as opções da configuração e registra as versões', async () => {
    const a = provedor();
    const plataforma = new PlataformaIa(
      configuracao,
      new Map([
        ['a', a],
        ['b', provedor()],
      ]),
    );
    const resultado = await plataforma.executarTarefa('classificar', prompt, Saida);
    expect(resultado).toMatchObject({
      saida: { tipoAto: 'ficticio' },
      modelo: 'modelo-a1',
      provedor: 'a',
      tarefa: 'classificar',
      versaoDoPrompt: 'teste@1',
      versaoDaConfiguracao: 'teste',
      falhasAnteriores: [],
    });
    expect(a.chamadas).toEqual([
      { modelo: 'modelo-a1', maxTokensSaida: 100, cachePrompt: true, temperatura: 0 },
    ]);
  });

  it('fallback em erro transitório e cota, inclusive para outro provedor', async () => {
    const a = provedor({
      'modelo-a1': new ErroTransitorio('circuito aberto', 'a'),
      'modelo-a2': new ErroLimiteExcedido('cota', 'a'),
    });
    const plataforma = new PlataformaIa(
      configuracao,
      new Map([
        ['a', a],
        ['b', provedor()],
      ]),
    );
    const resultado = await plataforma.executarTarefa('classificar', prompt, Saida);
    expect(resultado).toMatchObject({ provedor: 'b', modelo: 'modelo-b1' });
    expect(resultado.falhasAnteriores.map((f) => f.modelo)).toEqual(['modelo-a1', 'modelo-a2']);
  });

  it('sem fallback para saída inválida, credencial ou erro inesperado; todos fora: o último erro', async () => {
    for (const erro of [
      new ErroPermanente('saída fora do schema', 'a'),
      new ErroCredencialInvalida('chave', 'a'),
      new TypeError('defeito'),
    ]) {
      const a = provedor({ 'modelo-a1': erro });
      const plataforma = new PlataformaIa(
        configuracao,
        new Map([
          ['a', a],
          ['b', provedor()],
        ]),
      );
      await expect(plataforma.executarTarefa('classificar', prompt, Saida)).rejects.toBe(erro);
      expect(a.chamadas).toHaveLength(1);
    }
    const fora = new ErroTransitorio('fora', 'b');
    const plataforma = new PlataformaIa(
      configuracao,
      new Map([
        ['a', provedor()],
        ['b', provedor({ 'modelo-b1': fora })],
      ]),
    );
    await expect(plataforma.executarTarefa('resumir', prompt, Saida)).rejects.toBe(fora);
  });

  it('lote: primeiro provedor que aceita; tarefa sem lote ou sem provedor com lote é erro', async () => {
    const comLote = new PlataformaIa(
      configuracao,
      new Map([
        ['a', provedor()],
        ['b', provedor({}, true)],
      ]),
    );
    expect(await comLote.enviarLote('classificar', [{ id: '1', prompt }])).toEqual({
      loteId: 'lote-1',
      provedor: 'b',
      modelo: 'modelo-b1',
    });
    await expect(comLote.enviarLote('resumir', [{ id: '1', prompt }])).rejects.toThrow(
      /não usa lote/,
    );
    const semLote = new PlataformaIa(
      configuracao,
      new Map([
        ['a', provedor()],
        ['b', provedor()],
      ]),
    );
    await expect(semLote.enviarLote('classificar', [{ id: '1', prompt }])).rejects.toThrow(
      /aceita lote/,
    );
  });

  it('tarefa desconhecida e provedor não registrado são recusados', async () => {
    const plataforma = new PlataformaIa(
      configuracao,
      new Map([
        ['a', provedor()],
        ['b', provedor()],
      ]),
    );
    await expect(plataforma.executarTarefa('outra', prompt, Saida)).rejects.toBeInstanceOf(
      ErroPermanente,
    );
    expect(() => new PlataformaIa(configuracao, new Map([['a', provedor()]]))).toThrow(
      /provedor b/,
    );
  });
});

describe('configuração versionada (HU58)', () => {
  it('o arquivo do repositório é válido e toda tarefa tem modelo primário', () => {
    const bruta: unknown = JSON.parse(
      readFileSync(new URL('../configuracao/tarefas.json', import.meta.url), 'utf8'),
    );
    const lida = lerConfiguracaoDasTarefas(bruta);
    expect(Object.keys(lida.tarefas)).toContain('classificar-ato');
    for (const tarefa of Object.values(lida.tarefas))
      expect(tarefa.modelos.length).toBeGreaterThan(0);
  });

  it('recusa configuração sem modelo, com campo desconhecido ou temperatura fora da faixa', () => {
    const base = { descricao: 'x', maxTokensSaida: 1, cachePrompt: false, lote: false };
    for (const tarefa of [
      { ...base, modelos: [] },
      { ...base, modelos: [{ provedor: 'a', modelo: 'm' }], extra: true },
      { ...base, modelos: [{ provedor: 'a', modelo: 'm' }], temperatura: 2 },
    ]) {
      expect(() => lerConfiguracaoDasTarefas({ versao: 'v', tarefas: { t: tarefa } })).toThrow();
    }
  });
});
