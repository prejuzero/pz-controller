import { OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ClassificarPorRegras } from '../application/classificar.js';

import { RegrasEmMemoria } from './em-memoria.js';

// Regras e teores FICTÍCIOS.
describe('ClassificarPorRegras (HU20)', () => {
  it('usa só a maior versão ativa de cada código', async () => {
    const regras = new RegrasEmMemoria([
      { codigo: 'r1', versao: 2, tipoAto: 'citacao', padroes: ['\\bcite-se\\b'], confianca: 0.9 },
      { codigo: 'r1', versao: 1, tipoAto: 'antigo', padroes: ['\\bcite-se\\b'], confianca: 0.99 },
      {
        codigo: 'r2',
        versao: 1,
        tipoAto: 'retirada',
        padroes: ['\\bcite-se\\b'],
        confianca: 1,
        ativa: false,
      },
    ]);
    const r = await new ClassificarPorRegras(new OutboxEmMemoria(), regras).executar('Cite-se.');
    expect(r).toMatchObject({ situacao: 'classificada', tipoAto: 'citacao', regra: { versao: 2 } });
  });

  it('regra mal cadastrada lança em vez de ser ignorada', async () => {
    const regras = new RegrasEmMemoria([
      { codigo: 'ruim', versao: 1, tipoAto: 'x', padroes: ['('], confianca: 0.9 },
    ]);
    await expect(
      new ClassificarPorRegras(new OutboxEmMemoria(), regras).executar('qualquer'),
    ).rejects.toThrow(/expressão regular mal formada/);
  });
});
