import { describe, expect, it } from 'vitest';

import {
  criarConfigVitest,
  criarConfigVitestIntegracao,
  LIMIAR_COBERTURA,
  limiaresDeCobertura,
  PADRAO_TESTE_INTEGRACAO,
  PADRAO_TESTE_UNITARIO,
} from './vitest.js';

describe('limiaresDeCobertura', () => {
  it('no layout de módulo, testa e mede as camadas na raiz', () => {
    const config = criarConfigVitest({ layout: 'modulo' });
    expect(config.test?.include).toEqual([
      'domain/**/*.test.ts',
      'application/**/*.test.ts',
      'infra/**/*.test.ts',
    ]);
    expect(config.test?.coverage).toMatchObject({
      include: ['domain/**/*.ts', 'application/**/*.ts', 'infra/**/*.ts', 'index.ts'],
    });
  });

  it('tira da cobertura unitária só os pontos de entrada informados', () => {
    const config = criarConfigVitest({ pontosDeEntrada: ['src/main.ts'] });
    expect(config.test?.coverage).toMatchObject({
      exclude: ['**/*.test.ts', '**/*.int.test.ts', 'src/main.ts'],
    });
  });

  it('exige 100% no kernel', () => {
    expect(limiaresDeCobertura('kernel').branches).toBe(100);
  });

  it('exige 100% no motor de prazos', () => {
    expect(limiaresDeCobertura('motor')).toEqual({
      lines: 100,
      functions: 100,
      branches: 100,
      statements: 100,
    });
  });

  it('exige 90% no perfil padrão', () => {
    expect(limiaresDeCobertura('padrao').lines).toBe(90);
    expect(LIMIAR_COBERTURA.padrao).toBe(90);
  });
});

describe('criarConfigVitest', () => {
  it('usa o perfil padrão quando nenhum é informado', () => {
    const config = criarConfigVitest();
    expect(config.test?.coverage).toMatchObject({ thresholds: limiaresDeCobertura('padrao') });
  });

  it('aplica o perfil informado', () => {
    const config = criarConfigVitest({ perfil: 'motor' });
    expect(config.test?.coverage).toMatchObject({ thresholds: limiaresDeCobertura('motor') });
  });

  it('separa testes unitários dos de integração', () => {
    const config = criarConfigVitest();
    expect(config.test?.include).toEqual([PADRAO_TESTE_UNITARIO]);
    expect(config.test?.exclude).toContain(PADRAO_TESTE_INTEGRACAO);
  });
});

describe('criarConfigVitestIntegracao', () => {
  it('roda apenas testes de integração com timeouts maiores', () => {
    const config = criarConfigVitestIntegracao();
    expect(config.test?.include).toEqual([PADRAO_TESTE_INTEGRACAO]);
    expect(config.test?.testTimeout).toBe(60_000);
  });
});
