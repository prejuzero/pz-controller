import { describe, expect, it } from 'vitest';

import { EFEITOS } from './calendario.js';

import {
  CONTAGENS,
  ENTES,
  MEIOS,
  MOTIVOS_A_CONFIRMAR,
  POLITICAS_DE_DOBRO,
  RAMOS,
  UNIDADES,
} from './index.js';

// Contrato do motor: mudar estes valores exige migrar os prazos gravados (ADR-007).
describe('modelo de entrada e saída do motor', () => {
  it('fixa os valores aceitos', () => {
    expect(RAMOS).toEqual(['civel', 'juizados', 'trabalhista', 'penal', 'juizado-criminal']);
    expect(MEIOS).toEqual(['djen', 'portal', 'manual']);
    expect(UNIDADES).toEqual(['dias', 'horas', 'meses', 'anos']);
    expect(CONTAGENS).toEqual(['uteis', 'corridos']);
    expect(ENTES).toEqual(['fazenda-publica', 'ministerio-publico', 'defensoria']);
    expect(POLITICAS_DE_DOBRO).toEqual([
      'entes-cpc',
      'so-defensoria',
      'fazenda-para-recorrer',
      'nao-dobra',
      'verificar',
    ]);
    expect(EFEITOS).toEqual(['sem-expediente', 'suspensao-de-prazos', 'indisponibilidade']);
    expect(MOTIVOS_A_CONFIRMAR).toEqual([
      'sem-regra-legal',
      'unidade-sem-regra',
      'ramo-sem-regra',
      'dados-insuficientes',
      'calendario-esgotado',
    ]);
  });
});
