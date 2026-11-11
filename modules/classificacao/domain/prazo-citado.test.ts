import { describe, expect, it } from 'vitest';

import { extrairPrazosCitados } from './prazo-citado.js';

// Trechos FICTÍCIOS, no formato das publicações reais analisadas (PZ-323).
const prazos = (teor: string) =>
  extrairPrazosCitados(teor).map((p) => `${String(p.quantidade)} ${p.unidade}`);

describe('falsos positivos do prazo citado (PZ-323)', () => {
  it('descarta o que não é prazo da parte: aluguel, validade, restituição, retroativo e auxiliar', () => {
    expect(prazos('Cláusula penal equivalente a 3 (três) meses de aluguel.')).toEqual([]);
    expect(prazos('Certidão com validade de 120 (cento e vinte) dias.')).toEqual([]);
    expect(prazos('Documento válido por 90 dias a contar da emissão.')).toEqual([]);
    expect(prazos('Fixada a tese: restituição em até 12 (doze) meses.')).toEqual([]);
    expect(prazos('Rol de testemunhas até 10 (dez) dias antes da audiência.')).toEqual([]);
    expect(prazos('Intime-se o perito para entregar o laudo em 30 (trinta) dias.')).toEqual([]);
  });

  it('mantém o prazo da parte, mesmo perto dessas palavras', () => {
    expect(
      prazos('Intimem-se as partes sobre o laudo do perito, no prazo de 15 (quinze) dias.'),
    ).toEqual(['15 dias']);
    expect(prazos('Pague o débito de aluguel no prazo de 3 (três) dias.')).toEqual(['3 dias']);
    expect(
      prazos(
        'Intime-se a parte autora para, em 5 (cinco) dias, juntar certidão com validade de 30 dias.',
      ),
    ).toEqual(['5 dias']);
  });
});
