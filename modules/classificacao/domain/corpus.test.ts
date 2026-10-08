import { describe, expect, it } from 'vitest';

import { extrairPrazosCitados } from './prazo-citado.js';
import { classificarPorRegras, type RegraRapida } from './regras.js';

/**
 * QA da HU20 (PZ-155): tabela de frases FICTÍCIAS com o prazo esperado (ou nenhum). Mede a precisão
 * do extrator e das regras de exemplo; a meta é ≥ 99% nas regras que classificam sem IA. A precisão
 * sobre teores reais anonimizados é medida no conjunto de avaliação da HU22 (`eval/`).
 */
type Esperado = readonly [quantidade: number, unidade: string, trecho: string] | null;

const CORPUS: readonly (readonly [teor: string, esperado: Esperado])[] = [
  // Numéricos
  ['Manifeste-se a parte autora em 15 dias.', [15, 'dias', '15 dias']],
  ['Apresente o réu as contrarrazões em 15 dias úteis.', [15, 'dias-uteis', '15 dias úteis']],
  ['Junte o documento em 48 horas.', [48, 'horas', '48 horas']],
  ['Suspendo o feito por 6 meses.', [6, 'meses', '6 meses']],
  ['Arquive-se provisoriamente por 1 ano.', [1, 'anos', '1 ano']],
  ['Recolha as custas em 1 dia.', [1, 'dias', '1 dia']],
  ['Prazo: 5 DIAS.', [5, 'dias', '5 DIAS']],
  // Por extenso
  ['Intime-se para réplica no prazo de quinze dias.', [15, 'dias', 'quinze dias']],
  ['Cumpra-se em cinco dias úteis.', [5, 'dias-uteis', 'cinco dias úteis']],
  ['Emende a inicial em trinta dias.', [30, 'dias', 'trinta dias']],
  ['Prazo de cento e vinte dias para a perícia.', [120, 'dias', 'cento e vinte dias']],
  ['Pague em três dias.', [3, 'dias', 'três dias']],
  ['Informe em duas horas.', [2, 'horas', 'duas horas']],
  ['Prazo de catorze dias.', [14, 'dias', 'catorze dias']],
  // Mistos
  ['No prazo de 15 (quinze) dias, apresente contestação.', [15, 'dias', '15 (quinze) dias']],
  ['Em 05 (cinco) dias úteis, especifiquem provas.', [5, 'dias-uteis', '05 (cinco) dias úteis']],
  ['Em dez (10) dias, diga sobre o laudo.', [10, 'dias', 'dez (10) dias']],
  ['Prazo de 72 (setenta e duas) horas.', [72, 'horas', '72 (setenta e duas) horas']],
  ['Suspenda-se por 2 (dois) anos.', [2, 'anos', '2 (dois) anos']],
  ['Em 15( quinze )dias, manifeste-se.', [15, 'dias', '15( quinze )dias']],
  // Falsos positivos conhecidos
  ['Certifico que o prazo de 15 dias já decorrido sem manifestação.', null],
  ['Prazo de 15 (quinze) dias decorrido in albis.', null],
  ['Certifico que decorreu o prazo de 5 dias sem resposta.', null],
  ['Certifico que transcorreu in albis o prazo de quinze dias.', null],
  ['Prazo de 10 dias esgotado. Conclusos.', null],
  ['A petição foi protocolada há 15 dias.', null],
  ['Condeno o réu a 10 (dez) dias-multa.', null],
  ['Fixo a pena em 2 (dois) anos de reclusão.', null],
  ['Pena de 6 meses de detenção.', null],
  ['A autora, com 70 anos de idade, requer prioridade.', null],
  ['Processo 0001234-56.2026.8.26.0100. Vistos.', null],
  ['Nos termos do art. 15 da Lei 9.099/95, cite-se.', null],
  ['Valor da causa: R$ 15.000,00.', null],
  // Prazo verdadeiro perto de palavras dos falsos positivos
  ['Pague em 3 (três) dias, sob pena de prisão.', [3, 'dias', '3 (três) dias']],
  ['Decorrido o prazo, manifeste-se o autor em 5 dias.', [5, 'dias', '5 dias']],
];

describe('corpus do prazo citado (PZ-155)', () => {
  it.each(CORPUS)('%s', (teor, esperado) => {
    const [primeiro] = extrairPrazosCitados(teor);
    if (esperado === null) {
      expect(primeiro).toBeUndefined();
      return;
    }
    const [quantidade, unidade, trecho] = esperado;
    expect(primeiro).toMatchObject({ quantidade, unidade, evidencia: { trecho } });
    // O offset aponta exatamente para o trecho no teor original.
    expect(teor.slice(primeiro?.evidencia.inicio, primeiro?.evidencia.fim)).toBe(trecho);
  });

  it('precisão e revocação do extrator no corpus', () => {
    let verdadeiros = 0;
    let falsos = 0;
    let perdidos = 0;
    for (const [teor, esperado] of CORPUS) {
      const [p] = extrairPrazosCitados(teor);
      if (p === undefined) perdidos += esperado === null ? 0 : 1;
      else if (esperado !== null && p.quantidade === esperado[0] && p.unidade === esperado[1])
        verdadeiros += 1;
      else falsos += 1;
    }
    const precisao = verdadeiros / (verdadeiros + falsos);
    const revocacao = verdadeiros / (verdadeiros + perdidos);
    expect(precisao).toBeGreaterThanOrEqual(0.99);
    expect(revocacao).toBeGreaterThanOrEqual(0.99);
  });
});

// Regras de EXEMPLO (as reais são da curadoria): medem o mecanismo, não a taxonomia.
const REGRAS: RegraRapida[] = [
  {
    codigo: 'ex-citacao',
    versao: 1,
    tipoAto: 'citacao',
    padroes: ['\\bcite-se\\b'],
    confianca: 0.95,
  },
  {
    codigo: 'ex-sentenca',
    versao: 1,
    tipoAto: 'sentenca',
    padroes: ['\\bjulgo\\s{1,5}(?:im)?procedente', '\\bjulgo\\s{1,5}extinto'],
    confianca: 0.95,
  },
  {
    codigo: 'ex-despacho',
    versao: 1,
    tipoAto: 'despacho',
    padroes: ['\\bvistos\\b'],
    confianca: 0.5,
  },
];

const ROTULADOS: readonly (readonly [teor: string, tipoAto: string | null])[] = [
  ['Cite-se o réu.', 'citacao'],
  ['Vistos. CITE-SE por carta.', 'citacao'],
  ['Ante o exposto, JULGO PROCEDENTE o pedido.', 'sentenca'],
  ['Julgo improcedentes os pedidos.', 'sentenca'],
  ['Julgo extinto o processo sem resolução do mérito.', 'sentenca'],
  ['Vistos. Cite-se e intime-se. Ao final, julgo procedente a liminar.', 'citacao'],
  ['Vistos. Conclusos.', 'despacho'],
  ['Citação negativa. Diga o autor.', null],
  ['O citado réu compareceu.', null],
  ['Intime-se.', null],
];

describe('precisão das regras rápidas de exemplo (PZ-155)', () => {
  it('≥ 99% entre as que classificam com confiança ≥ 0,85; o resto fica "a confirmar"', () => {
    let acertos = 0;
    let classificadas = 0;
    for (const [teor, esperado] of ROTULADOS) {
      const r = classificarPorRegras(teor, REGRAS);
      if (r.situacao !== 'classificada' || r.confianca < 0.85) continue;
      classificadas += 1;
      if (r.tipoAto === esperado) acertos += 1;
    }
    const precisao = acertos / classificadas;
    expect(classificadas).toBe(6);
    expect(precisao).toBeGreaterThanOrEqual(0.99);
  });
});
