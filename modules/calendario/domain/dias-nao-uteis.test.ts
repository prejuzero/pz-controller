import { gerarUuidV7, LocalDate } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { conteudo, relogio } from '../teste/ficticios.js';

import { alcanca, diasNaoUteis } from './dias-nao-uteis.js';

import type { EventoVigente, Jurisdicao } from './dias-nao-uteis.js';
import type { ConteudoDoEvento } from './evento.js';

// Jurisdições e eventos FICTÍCIOS: só exercitam o mecanismo.
const d = (texto: string) => {
  const r = LocalDate.analisar(texto);
  if (!r.ok) throw r.erro;
  return r.valor;
};
const vigente = (parcial: Partial<ConteudoDoEvento>, origem: 'global' | 'local' = 'global') =>
  ({ id: gerarUuidV7(relogio()), origem, conteudo: conteudo(parcial) }) satisfies EventoVigente;
const AQUI: Jurisdicao = { uf: 'XA', municipioIbge: '9900001', tribunal: 'TJXA', comarca: 'Alfa' };

describe('alcanca (HU13)', () => {
  it.each([
    [{ abrangencia: 'nacional' }, {}, true],
    [{ abrangencia: 'uf', uf: 'XA' }, AQUI, true],
    [{ abrangencia: 'uf', uf: 'XB' }, AQUI, false],
    [{ abrangencia: 'uf', uf: 'XA' }, {}, false],
    [{ abrangencia: 'municipio', uf: 'XA', municipioIbge: '9900001' }, AQUI, true],
    [{ abrangencia: 'municipio', uf: 'XB', municipioIbge: '9900001' }, AQUI, false],
    [{ abrangencia: 'municipio', uf: 'XA', municipioIbge: '9900002' }, AQUI, false],
    [{ abrangencia: 'tribunal', tribunal: 'TJXA' }, AQUI, true],
    [{ abrangencia: 'tribunal', tribunal: 'TRFX' }, AQUI, false],
    [{ abrangencia: 'comarca', tribunal: 'TJXA', comarca: 'Alfa' }, AQUI, true],
    // Mesma comarca em outro tribunal não é a mesma comarca.
    [{ abrangencia: 'comarca', tribunal: 'TJXB', comarca: 'Alfa' }, AQUI, false],
    [{ abrangencia: 'comarca', tribunal: 'TJXA', comarca: 'Beta' }, AQUI, false],
  ] as const)('%j em %j → %s', (local, jurisdicao, esperado) => {
    expect(alcanca(conteudo(local), jurisdicao)).toBe(esperado);
  });
});

describe('diasNaoUteis (HU13)', () => {
  it('um item por dia e evento, recortado no período e em ordem de data, com a fonte', () => {
    const recesso = vigente({
      tipo: 'recesso',
      inicio: d('2030-12-20'),
      fim: d('2031-01-20'),
      descricao: 'FICTÍCIO: recesso',
    });
    const local = vigente(
      {
        abrangencia: 'comarca',
        tribunal: 'TJXA',
        comarca: 'Alfa',
        inicio: d('2030-12-31'),
        fim: d('2030-12-31'),
      },
      'local',
    );
    const dias = diasNaoUteis([local, recesso], AQUI, d('2030-12-30'), d('2031-01-01'));
    expect(dias.map((dia) => [dia.data.paraIso(), dia.tipo, dia.fonte.origem])).toEqual([
      ['2030-12-30', 'recesso', 'global'],
      ['2030-12-31', 'recesso', 'global'],
      ['2030-12-31', 'feriado', 'local'],
      ['2031-01-01', 'recesso', 'global'],
    ]);
    expect(dias[0]?.fonte).toEqual({
      origem: 'global',
      eventoId: recesso.id,
      atoNormativo: 'FICTÍCIO: Lei de Teste, art. 1º',
      urlAto: 'https://exemplo.invalid/ficticio',
    });
  });

  it('29 de fevereiro em ano bissexto e evento fora do período ou da jurisdição', () => {
    const bissexto = vigente({ inicio: d('2032-02-28'), fim: d('2032-03-01') });
    const fora = vigente({ abrangencia: 'uf', uf: 'XB' });
    const depois = vigente({ inicio: d('2033-01-01'), fim: d('2033-01-01') });
    expect(
      diasNaoUteis([bissexto, fora, depois], AQUI, d('2032-01-01'), d('2032-12-31')).map((x) =>
        x.data.paraIso(),
      ),
    ).toEqual(['2032-02-28', '2032-02-29', '2032-03-01']);
  });

  const data = fc.integer({ min: 0, max: 3 * 366 }).map((n) => d('2030-01-01').maisDias(n));
  const evento = fc
    .tuple(data, fc.integer({ min: 0, max: 40 }), fc.constantFrom('global', 'local'))
    .map(([inicio, duracao, origem]) => vigente({ inicio, fim: inicio.maisDias(duracao) }, origem));

  it('propriedade: todo dia devolvido está no período e no evento; nenhum dia do evento falta', () => {
    fc.assert(
      fc.property(
        fc.array(evento, { maxLength: 8 }),
        data,
        fc.integer({ min: 0, max: 400 }),
        (eventos, inicio, duracao) => {
          const fim = inicio.maisDias(duracao);
          const dias = diasNaoUteis(eventos, {}, inicio, fim);
          dias.slice(1).forEach((dia, i) => {
            expect(dias[i]?.data.ehDepoisDe(dia.data)).toBe(false);
          });
          let esperados = 0;
          for (const e of eventos) {
            for (let x = e.conteudo.inicio; !x.ehDepoisDe(e.conteudo.fim); x = x.maisDias(1)) {
              if (!x.ehAntesDe(inicio) && !x.ehDepoisDe(fim)) esperados++;
            }
          }
          expect(dias).toHaveLength(esperados);
          for (const dia of dias) {
            expect(dia.data.ehAntesDe(inicio) || dia.data.ehDepoisDe(fim)).toBe(false);
          }
        },
      ),
    );
  });
});
