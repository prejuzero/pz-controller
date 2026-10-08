import { describe, expect, it } from 'vitest';

import { atoPrevisto, avaliar } from './avaliar.js';
import { GravadorDeProvedor, ProvedorGravado } from './gravacoes.js';
import { caso, ProvedorDeMentira, referencia, relogio } from './teste-apoio.js';

const casos = [
  caso('c1', 'Vistos. Cite-se o réu para contestar em 15 (quinze) dias.', 'citacao', {
    anotacao: {
      tipoAto: 'citacao',
      trecho: 'Cite-se',
      prazoCitado: { quantidade: 15, unidade: 'dias' },
    },
  }),
  caso('c2', 'Intime-se a parte autora sobre os documentos juntados.', 'intimacao-manifestacao'),
  caso('c3', 'Certifico que conferi as peças digitalizadas.', 'desconhecido'),
];

describe('runner da avaliação', () => {
  it('regras decidem sem IA; o resto passa pela plataforma de IA com o modelo primário', async () => {
    const real = new ProvedorDeMentira();
    const gravador = new GravadorDeProvedor(real, relogio);
    const resultados = await avaliar(casos, referencia, gravador, relogio);
    expect(resultados.map(atoPrevisto)).toEqual([
      'citacao',
      'intimacao-manifestacao',
      'desconhecido',
    ]);
    expect(resultados.map((r) => r.classificacao?.origem)).toEqual(['regra', 'ia', 'ia']);
    expect(resultados.map((r) => r.chamadas.map((c) => c.caso))).toEqual([[], ['c2'], ['c3']]);
    expect(resultados[0]?.classificacao?.prazoCitado).toMatchObject({
      quantidade: 15,
      unidade: 'dias',
    });
    expect(real.modelos).toEqual(['claude-haiku-4-5', 'claude-haiku-4-5']);
  });

  it('a reprodução das gravações dá o mesmo resultado, sem chamar o provedor real', async () => {
    const gravador = new GravadorDeProvedor(new ProvedorDeMentira(), relogio);
    const gravados = await avaliar(casos, referencia, gravador, relogio);
    const reproduzidos = await avaliar(
      casos,
      referencia,
      new ProvedorGravado(gravador.gravacoes, relogio),
      relogio,
    );
    expect(reproduzidos.map((r) => r.classificacao)).toEqual(gravados.map((r) => r.classificacao));
  });

  it('caso sem gravação vira "sem gravação"; os demais seguem', async () => {
    const resultados = await avaliar(casos, referencia, new ProvedorGravado({}, relogio), relogio);
    expect(resultados.map((r) => r.semGravacao)).toEqual([false, true, true]);
    expect(resultados[1]?.classificacao).toBeUndefined();
  });

  it('saída inválida repetida vai para revisão manual, como na produção', async () => {
    const gravador = new GravadorDeProvedor(new ProvedorDeMentira(), relogio);
    const [r] = await avaliar(
      [caso('c4', 'Texto QUEBRA sem ato claro.', 'desconhecido')],
      referencia,
      gravador,
      relogio,
    );
    expect(r?.classificacao).toMatchObject({
      situacao: 'revisao_manual',
      motivo: 'saida-invalida',
    });
    expect(r?.chamadas).toHaveLength(2);
  });

  it('falha de rede derruba a avaliação (nada falha em silêncio)', async () => {
    const gravador = new GravadorDeProvedor(new ProvedorDeMentira(), relogio);
    await expect(
      avaliar(
        [caso('c5', 'Texto REDE sem ato claro.', 'desconhecido')],
        referencia,
        gravador,
        relogio,
      ),
    ).rejects.toThrow('caiu');
  });
});
