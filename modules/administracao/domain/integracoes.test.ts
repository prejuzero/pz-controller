import { Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { consolidar, falhasNovas, VALIDADE_DO_RETRATO_MS } from './integracoes.js';

import type { Retrato } from './integracoes.js';

const t = (min: number) => Instant.deIso('2026-10-08T12:00:00Z').maisMs(min * 60_000);

const a: Retrato = {
  instancia: 'w1',
  em: t(0),
  situacoes: [
    { adaptador: 'djen', estado: 'operacional', ultimoSucesso: t(0) },
    { adaptador: 'smtp', estado: 'degradado', ultimaFalha: t(-1), erro: 'timeout' },
  ],
};
const b: Retrato = {
  instancia: 'w2',
  em: t(0),
  situacoes: [{ adaptador: 'djen', estado: 'indisponivel', ultimaFalha: t(-2), erro: 'HTTP 503' }],
};

describe('painel de integrações (HU39)', () => {
  it('junta as instâncias: pior estado, último sucesso e última falha', () => {
    expect(consolidar([a, b], t(1))).toEqual([
      {
        adaptador: 'djen',
        estado: 'indisponivel',
        instancias: 2,
        ultimoSucesso: t(0),
        ultimaFalha: t(-2),
        erro: 'HTTP 503',
      },
      {
        adaptador: 'smtp',
        estado: 'degradado',
        instancias: 1,
        ultimaFalha: t(-1),
        erro: 'timeout',
      },
    ]);
  });

  it('instância saudável não melhora o estado nem apaga a última falha da outra', () => {
    const saudavel: Retrato = {
      instancia: 'w3',
      em: t(0),
      situacoes: [{ adaptador: 'djen', estado: 'operacional' }],
    };
    expect(consolidar([b, saudavel], t(1))).toEqual([
      {
        adaptador: 'djen',
        estado: 'indisponivel',
        instancias: 2,
        ultimaFalha: t(-2),
        erro: 'HTTP 503',
      },
    ]);
    expect(consolidar([saudavel, saudavel], t(1))).toEqual([
      { adaptador: 'djen', estado: 'operacional', instancias: 2 },
    ]);
  });

  it('ignora retrato de instância parada', () => {
    const agora = t(0).maisMs(VALIDADE_DO_RETRATO_MS + 1);
    expect(consolidar([a], agora)).toEqual([]);
  });

  it('falhas novas: só as que mudaram desde o retrato anterior da instância', () => {
    expect(falhasNovas(undefined, a)).toEqual([
      { adaptador: 'smtp', instancia: 'w1', em: t(-1), erro: 'timeout' },
    ]);
    expect(falhasNovas(a, { ...a, em: t(1) })).toEqual([]);
    const depois: Retrato = {
      ...a,
      situacoes: [{ adaptador: 'smtp', estado: 'indisponivel', ultimaFalha: t(1) }],
    };
    expect(falhasNovas(a, depois)).toEqual([
      { adaptador: 'smtp', instancia: 'w1', em: t(1), erro: '' },
    ]);
  });
});
