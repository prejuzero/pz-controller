import { LocalDate } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calendarioDeOcorrencias, type OcorrenciaDatada } from './calendario.js';
import {
  contarDias,
  diasUteisRestantes,
  esteOuProximoQueConta,
  LIMITE_DE_DIAS,
  proximoDiaQueConta,
  semContar,
  semContarFimDeSemanaE,
} from './dias.js';

// Calendário FICTÍCIO: testa a aritmética, não o direito. Os casos com datas reais e assinados
// pela curadora entram na suíte do motor (PZ-135).
const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};
const feriado = (iso: string): OcorrenciaDatada => ({
  data: d(iso),
  efeito: 'sem-expediente',
  motivo: 'feriado fictício',
  atoNormativo: 'Lei fictícia 1/2000, art. 1º',
  urlAto: 'https://exemplo.invalid/lei-1',
});
const suspensao = (iso: string): OcorrenciaDatada => ({
  data: d(iso),
  efeito: 'suspensao-de-prazos',
  motivo: 'suspensão fictícia',
  atoNormativo: 'Portaria fictícia 2/2027',
  urlAto: 'https://exemplo.invalid/portaria-2',
});
const indisponibilidade = (iso: string): OcorrenciaDatada => ({
  data: d(iso),
  efeito: 'indisponibilidade',
  motivo: 'indisponibilidade fictícia',
  atoNormativo: 'Certidão fictícia 3/2027',
  urlAto: 'https://exemplo.invalid/certidao-3',
});
const vazio = calendarioDeOcorrencias([]);
const valor = <T>(r: { ok: true; valor: T } | { ok: false; erro: unknown }): T => {
  if (!r.ok) throw new Error('esperava ok');
  return r.valor;
};

describe('calendário por lista de ocorrências', () => {
  it('agrupa as ocorrências do mesmo dia e devolve vazio nos demais', () => {
    const calendario = calendarioDeOcorrencias([feriado('2027-03-03'), suspensao('2027-03-03')]);
    expect(calendario.ocorrencias(d('2027-03-03')).map((o) => o.efeito)).toEqual([
      'sem-expediente',
      'suspensao-de-prazos',
    ]);
    expect(calendario.ocorrencias(d('2027-03-04'))).toEqual([]);
  });
});

describe('critério de dias úteis (CPC, art. 216)', () => {
  const calendario = calendarioDeOcorrencias([
    feriado('2027-03-03'),
    suspensao('2027-03-02'),
    indisponibilidade('2027-03-04'),
  ]);

  it('não conta sábado nem domingo', () => {
    const conta = semContarFimDeSemanaE(vazio, []);
    expect(conta(d('2027-03-06'))).toEqual([
      { data: d('2027-03-06'), motivo: 'sábado', fundamento: 'CPC, art. 216' },
    ]);
    expect(conta(d('2027-03-07'))[0]?.motivo).toBe('domingo');
    expect(conta(d('2027-03-05'))).toEqual([]);
  });

  it('dia sem expediente cita o CPC, art. 216 e o ato do calendário', () => {
    const conta = semContarFimDeSemanaE(calendario, ['sem-expediente']);
    expect(conta(d('2027-03-03'))).toEqual([
      {
        data: d('2027-03-03'),
        motivo: 'feriado fictício',
        fundamento: 'CPC, art. 216; Lei fictícia 1/2000, art. 1º',
        urlAto: 'https://exemplo.invalid/lei-1',
      },
    ]);
  });

  it('só os efeitos pedidos tiram o dia da contagem', () => {
    const soFeriados = semContarFimDeSemanaE(calendario, ['sem-expediente']);
    expect(soFeriados(d('2027-03-02'))).toEqual([]);
    expect(soFeriados(d('2027-03-04'))).toEqual([]);
    const comSuspensao = semContarFimDeSemanaE(calendario, [
      'sem-expediente',
      'suspensao-de-prazos',
    ]);
    expect(comSuspensao(d('2027-03-02'))).toEqual([
      {
        data: d('2027-03-02'),
        motivo: 'suspensão fictícia',
        fundamento: 'Portaria fictícia 2/2027',
        urlAto: 'https://exemplo.invalid/portaria-2',
      },
    ]);
  });

  it('fim de semana com feriado registra os dois motivos', () => {
    const conta = semContarFimDeSemanaE(calendarioDeOcorrencias([feriado('2027-03-06')]), [
      'sem-expediente',
    ]);
    expect(conta(d('2027-03-06')).map((m) => m.motivo)).toEqual(['sábado', 'feriado fictício']);
  });
});

describe('critério de dias corridos', () => {
  it('conta fim de semana e só exclui os efeitos pedidos', () => {
    const calendario = calendarioDeOcorrencias([feriado('2027-03-03'), suspensao('2027-03-02')]);
    const conta = semContar(calendario, ['suspensao-de-prazos']);
    expect(conta(d('2027-03-06'))).toEqual([]);
    expect(conta(d('2027-03-03'))).toEqual([]);
    expect(conta(d('2027-03-02')).map((m) => m.motivo)).toEqual(['suspensão fictícia']);
  });
});

describe('contagem de dias', () => {
  const uteis = semContarFimDeSemanaE(calendarioDeOcorrencias([feriado('2027-03-03')]), [
    'sem-expediente',
  ]);

  it('o início é o dia 1 quando conta', () => {
    expect(valor(contarDias(d('2027-03-01'), 1, uteis))).toEqual({
      data: d('2027-03-01'),
      desconsiderados: [],
    });
  });

  it('5 dias úteis a partir de segunda pulam o feriado e o fim de semana', () => {
    const avanco = valor(contarDias(d('2027-03-01'), 5, uteis));
    expect(avanco.data).toEqual(d('2027-03-08'));
    expect(avanco.desconsiderados.map((m) => [m.data.paraIso(), m.motivo])).toEqual([
      ['2027-03-03', 'feriado fictício'],
      ['2027-03-06', 'sábado'],
      ['2027-03-07', 'domingo'],
    ]);
  });

  it('dias desconsiderados depois do vencimento não entram na memória', () => {
    const avanco = valor(contarDias(d('2027-03-01'), 2, uteis));
    expect(avanco.data).toEqual(d('2027-03-02'));
    expect(avanco.desconsiderados).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.NaN])('recusa quantidade %s', (quantidade) => {
    expect(() => contarDias(d('2027-03-01'), quantidade, uteis)).toThrow(RangeError);
  });

  it('calendário que nunca deixa contar vira erro, não laço infinito', () => {
    const nada = () => [{ data: d('2027-03-01'), motivo: 'x', fundamento: 'y' }];
    expect(contarDias(d('2027-03-01'), 1, nada)).toEqual({
      ok: false,
      erro: { tipo: 'calendario-esgotado', aPartirDe: d('2027-03-01') },
    });
  });

  it('conta exatamente até o limite de dias percorridos', () => {
    const corridos = semContar(vazio, []);
    expect(valor(contarDias(d('2027-03-01'), LIMITE_DE_DIAS, corridos)).data).toEqual(
      d('2027-03-01').maisDias(LIMITE_DE_DIAS - 1),
    );
    expect(contarDias(d('2027-03-01'), LIMITE_DE_DIAS + 1, corridos).ok).toBe(false);
  });

  it('próximo dia que conta é estritamente depois da data', () => {
    expect(valor(proximoDiaQueConta(d('2027-03-02'), uteis))).toEqual({
      data: d('2027-03-04'),
      desconsiderados: [
        {
          data: d('2027-03-03'),
          motivo: 'feriado fictício',
          fundamento: 'CPC, art. 216; Lei fictícia 1/2000, art. 1º',
          urlAto: 'https://exemplo.invalid/lei-1',
        },
      ],
    });
    expect(valor(proximoDiaQueConta(d('2027-03-01'), uteis)).data).toEqual(d('2027-03-02'));
  });

  it('este ou o próximo: mantém o dia que conta e prorroga o que não conta', () => {
    expect(valor(esteOuProximoQueConta(d('2027-03-05'), uteis)).data).toEqual(d('2027-03-05'));
    expect(valor(esteOuProximoQueConta(d('2027-03-06'), uteis)).data).toEqual(d('2027-03-08'));
  });
});

describe('propriedades da contagem', () => {
  const inicio = fc.integer({ min: 0, max: 3650 }).map((n) => d('2026-01-01').maisDias(n));
  const feriados = fc.uniqueArray(fc.integer({ min: 0, max: 400 }), { maxLength: 40 });

  it('o vencimento conta e há exatamente n dias contados no intervalo', () => {
    fc.assert(
      fc.property(inicio, fc.integer({ min: 1, max: 60 }), feriados, (ini, n, deslocamentos) => {
        const calendario = calendarioDeOcorrencias(
          deslocamentos.map((k) => feriado(ini.maisDias(k).paraIso())),
        );
        const conta = semContarFimDeSemanaE(calendario, ['sem-expediente']);
        const { data, desconsiderados } = valor(contarDias(ini, n, conta));
        expect(conta(data)).toEqual([]);
        let contados = 0;
        const pulados: string[] = [];
        for (let dia = ini; !dia.ehDepoisDe(data); dia = dia.maisDias(1)) {
          if (conta(dia).length === 0) contados++;
          else pulados.push(dia.paraIso());
        }
        expect(contados).toBe(n);
        expect([...new Set(desconsiderados.map((m) => m.data.paraIso()))]).toEqual(pulados);
      }),
      { numRuns: 300 },
    );
  });

  it('sem eventos, n dias corridos terminam em início + n - 1', () => {
    fc.assert(
      fc.property(inicio, fc.integer({ min: 1, max: 400 }), (ini, n) => {
        expect(valor(contarDias(ini, n, semContar(vazio, []))).data).toEqual(ini.maisDias(n - 1));
      }),
    );
  });

  it('mais dias nunca vencem antes (monotonia)', () => {
    fc.assert(
      fc.property(inicio, fc.integer({ min: 1, max: 59 }), feriados, (ini, n, deslocamentos) => {
        const calendario = calendarioDeOcorrencias(
          deslocamentos.map((k) => feriado(ini.maisDias(k).paraIso())),
        );
        const conta = semContarFimDeSemanaE(calendario, ['sem-expediente']);
        const antes = valor(contarDias(ini, n, conta)).data;
        const depois = valor(contarDias(ini, n + 1, conta)).data;
        expect(depois.ehDepoisDe(antes)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe('dias úteis restantes (informação de urgência, HU26)', () => {
  // 2027-03-01 é segunda-feira (calendário FICTÍCIO).
  it('conta os dias úteis depois de hoje até o vencimento, inclusive', () => {
    expect(valor(diasUteisRestantes(d('2027-03-01'), d('2027-03-05'), vazio))).toBe(4);
  });

  it('vence hoje ou já venceu: zero', () => {
    expect(valor(diasUteisRestantes(d('2027-03-05'), d('2027-03-05'), vazio))).toBe(0);
    expect(valor(diasUteisRestantes(d('2027-03-08'), d('2027-03-05'), vazio))).toBe(0);
  });

  it('não conta sábado, domingo, feriado nem suspensão de prazos', () => {
    const calendario = calendarioDeOcorrencias([feriado('2027-03-09'), suspensao('2027-03-10')]);
    // sex 05 → seg 08, (ter 09 feriado), (qua 10 suspensão), qui 11
    expect(valor(diasUteisRestantes(d('2027-03-05'), d('2027-03-11'), calendario))).toBe(2);
  });

  it('indisponibilidade não tira o dia da contagem (CPC, art. 224, §1º só prorroga)', () => {
    const calendario = calendarioDeOcorrencias([indisponibilidade('2027-03-02')]);
    expect(valor(diasUteisRestantes(d('2027-03-01'), d('2027-03-02'), calendario))).toBe(1);
  });

  it('vencimento além do teto de dias: calendário esgotado', () => {
    const r = diasUteisRestantes(
      d('2027-03-01'),
      d('2027-03-01').maisDias(LIMITE_DE_DIAS + 1),
      vazio,
    );
    expect(r.ok).toBe(false);
  });

  it('propriedade: nunca passa dos dias corridos e cresce com o vencimento', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 30 }),
        fc.array(fc.integer({ min: 0, max: 430 }), { maxLength: 40 }),
        (distancia, extra, feriados) => {
          const hoje = d('2027-01-04');
          const calendario = calendarioDeOcorrencias(
            feriados.map((n) => feriado(hoje.maisDias(n).paraIso())),
          );
          const antes = valor(diasUteisRestantes(hoje, hoje.maisDias(distancia), calendario));
          const depois = valor(
            diasUteisRestantes(hoje, hoje.maisDias(distancia + extra), calendario),
          );
          expect(antes).toBeLessThanOrEqual(distancia);
          expect(depois).toBeGreaterThanOrEqual(antes);
        },
      ),
      { numRuns: 200 },
    );
  });
});
