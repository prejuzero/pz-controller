import { configuracaoPadrao } from '@pz/ia';
import { describe, expect, it } from 'vitest';

import {
  calcularMetricas,
  META_DE_ACERTO,
  montarRelatorio,
  relatorioEmMarkdown,
  veredito,
  type Metricas,
} from './relatorio.js';
import { caso } from './teste-apoio.js';

import type { ResultadoDoCaso } from './avaliar.js';
import type { Classificacao } from '@pz/classificacao';

const configuracao = configuracaoPadrao();

const classificacao = (
  tipoAto: string | null,
  origem: Classificacao['origem'] = 'ia',
): Classificacao => ({
  origem,
  situacao: tipoAto === null ? 'a_confirmar' : 'ok',
  tipoAto,
  confianca: 0.9,
  evidencias: [],
  prazoCitado: null,
});

const chamada = (latenciaMs: number) => ({
  caso: 'x',
  modelo: 'claude-haiku-4-5',
  latenciaMs,
  resultado: {
    tipo: 'ok' as const,
    saida: {},
    modeloQueRespondeu: 'claude-haiku-4-5',
    uso: { tokensEntrada: 1_000_000, tokensSaida: 0, tokensCacheLidos: 0 },
  },
});

const resultado = (
  id: string,
  anotado: string,
  /** null = sem ato; "sem-gravacao" = faltou gravação. */
  previsto: string | null,
  extra: Partial<ResultadoDoCaso> = {},
): ResultadoDoCaso => ({
  caso: caso(id, `Teor do caso ${id} com texto suficiente.`, anotado, {
    anotacao: { tipoAto: anotado, trecho: '', prazoCitado: null },
  }),
  ...(previsto === 'sem-gravacao' ? {} : { classificacao: classificacao(previsto) }),
  semGravacao: previsto === 'sem-gravacao',
  chamadas: [],
  ...extra,
});

describe('métricas', () => {
  it('acurácia, por tipo, matriz de confusão, prazo citado, custo e latência', () => {
    const m = calcularMetricas(
      [
        resultado('a', 'citacao', 'citacao', { chamadas: [chamada(100)] }),
        resultado('b', 'citacao', 'sentenca', { chamadas: [chamada(300)] }),
        resultado('c', 'desconhecido', null),
        resultado('d', 'sentenca', 'sem-gravacao'),
      ],
      configuracao,
    );
    expect(m).toMatchObject({
      casos: 4,
      acertos: 2,
      acuracia: 0.5,
      semGravacao: 1,
      prazoCitadoCorreto: 3,
      chamadasIa: 2,
      latenciaMediaMs: 200,
      latenciaP95Ms: 300,
      porOrigem: { ia: 3, 'sem-gravacao': 1 },
      porSituacao: { ok: 2, a_confirmar: 1, 'sem-gravacao': 1 },
      confusao: {
        citacao: { citacao: 1, sentenca: 1 },
        desconhecido: { desconhecido: 1 },
        sentenca: { 'sem-gravacao': 1 },
      },
    });
    // 2 chamadas de 1 milhão de tokens de entrada a US$ 1 por milhão.
    expect(m.custoUsd).toBeCloseTo(2);
    expect(m.porTipo.find((t) => t.tipo === 'citacao')).toEqual({
      tipo: 'citacao',
      anotados: 2,
      previstos: 1,
      acertos: 1,
    });
  });

  it('conjunto vazio não tem acurácia nem latência', () => {
    expect(calcularMetricas([], configuracao)).toMatchObject({
      casos: 0,
      acuracia: null,
      latenciaMediaMs: null,
      latenciaP95Ms: null,
    });
  });

  it('prazo citado compara quantidade e unidade', () => {
    const anotado = caso('p', 'Manifeste-se em 15 dias sobre o laudo.', 'intimacao-manifestacao', {
      anotacao: {
        tipoAto: 'intimacao-manifestacao',
        trecho: '',
        prazoCitado: { quantidade: 15, unidade: 'dias' },
      },
    });
    const com = (quantidade: number) => ({
      ...classificacao('intimacao-manifestacao'),
      prazoCitado: {
        quantidade,
        unidade: 'dias' as const,
        unidadeImplicita: false,
        divergente: false,
        evidencia: { inicio: 0, fim: 1, trecho: 'x' },
      },
    });
    const m = calcularMetricas(
      [
        { caso: anotado, classificacao: com(15), semGravacao: false, chamadas: [] },
        { caso: anotado, classificacao: com(10), semGravacao: false, chamadas: [] },
        { caso: anotado, classificacao: classificacao('x'), semGravacao: false, chamadas: [] },
      ],
      configuracao,
    );
    expect(m.prazoCitadoCorreto).toBe(1);
  });
});

describe('veredito do gate', () => {
  const metricas = (acuracia: number | null, casos = 100, semGravacao = 0): Metricas => ({
    ...calcularMetricas([], configuracao),
    casos,
    acuracia,
    semGravacao,
  });

  it('sem casos reais passa com aviso', () => {
    expect(veredito(metricas(null, 0), false)).toEqual({
      aprovado: true,
      aviso: expect.stringContaining('nenhum caso real') as unknown,
    });
  });

  it('caso da meta sem gravação reprova', () => {
    expect(veredito(metricas(1, 100, 1), false)).toMatchObject({ aprovado: false });
  });

  it(`reprova abaixo de ${String(META_DE_ACERTO)} e aprova a partir dela`, () => {
    expect(veredito(metricas(0.979), false)).toMatchObject({
      aprovado: false,
      motivo: expect.stringContaining('97,9%') as unknown,
    });
    expect(veredito(metricas(0.98), false)).toEqual({ aprovado: true });
    expect(veredito(metricas(1), true)).toMatchObject({
      aprovado: true,
      aviso: expect.any(String) as unknown,
    });
  });
});

describe('relatório', () => {
  const versoes = {
    versaoDoPrompt: 'classificar-ato@0.1.0',
    versaoDaConfiguracao: 'c1',
    versaoDaTaxonomia: 't1',
    versaoDasRegras: 'r1',
  };

  it('a meta só conta casos reais revisados; erros saem sem o teor', () => {
    const ficticio = resultado('f', 'citacao', 'sentenca');
    const semRevisor = resultado('s', 'citacao', 'sentenca');
    const r = montarRelatorio(
      [
        resultado('a', 'citacao', 'citacao'),
        { ...ficticio, caso: { ...ficticio.caso, origem: 'ficticio' } },
        { ...semRevisor, caso: { ...semRevisor.caso, revisor: null } },
        resultado('d', 'sentenca', 'sem-gravacao'),
      ],
      configuracao,
      versoes,
      false,
    );
    expect(r.meta.casos).toBe(2);
    expect(r.todos.casos).toBe(4);
    expect(r.veredito).toMatchObject({ aprovado: false });
    expect(r.erros).toEqual([
      { caso: 'f', anotado: 'citacao', previsto: 'sentenca' },
      { caso: 's', anotado: 'citacao', previsto: 'sentenca' },
      { caso: 'd', anotado: 'sentenca', previsto: 'sem-gravacao' },
    ]);
    const md = relatorioEmMarkdown(r);
    expect(md).toContain('**Reprovado**');
    expect(md).toContain('classificar-ato@0.1.0');
    expect(md).toContain('- citacao → citacao (1)');
    expect(md).not.toContain('Teor do caso');
  });

  it('aprovado com aviso e sem erros', () => {
    const md = relatorioEmMarkdown(montarRelatorio([], configuracao, versoes, true));
    expect(md).toContain('**Aprovado** (aviso: Meta não medida');
    expect(md).toContain('Nenhum.');
  });

  it('aprovado sem aviso', () => {
    const md = relatorioEmMarkdown(
      montarRelatorio([resultado('a', 'citacao', 'citacao')], configuracao, versoes, false),
    );
    expect(md).toContain('Resultado: **Aprovado**\n');
  });
});
