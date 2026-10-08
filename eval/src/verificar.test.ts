import { describe, expect, it } from 'vitest';

import { verificarConjunto } from './verificar.js';

// Caso FICTÍCIO.
const caso = {
  id: 'caso-0001',
  origem: 'real-anonimizado',
  ramo: 'civel',
  teor: 'Cite-se a parte ré para contestar em 15 (quinze) dias.',
  anotacao: {
    tipoAto: 'citacao',
    trecho: 'Cite-se',
    prazoCitado: { quantidade: 15, unidade: 'dias' },
  },
  anotador: 'adv-01',
  revisor: 'adv-02',
  anonimizacaoConferidaPor: 'adv-02',
};
const verificar = (...casos: object[]) =>
  verificarConjunto(
    casos.map((c, i) => ({
      arquivo: `${String((c as { id?: string }).id ?? i)}.json`,
      conteudo: c,
    })),
  );

describe('verificação do conjunto (PZ-160)', () => {
  it('caso completo passa; "desconhecido" pode ter trecho vazio', () => {
    expect(verificar(caso)).toEqual([]);
    expect(
      verificar({ ...caso, anotacao: { tipoAto: 'desconhecido', trecho: '', prazoCitado: null } }),
    ).toEqual([]);
  });

  it.each([
    [
      'dado identificável',
      { teor: `${caso.teor} Processo 0000001-23.2026.8.26.0100.` },
      'dado identificável no teor: numero-cnj',
    ],
    [
      'trecho que não está no teor',
      { anotacao: { ...caso.anotacao, trecho: 'Intime-se' } },
      'o trecho anotado precisa ser literal do teor (vazio só em "desconhecido")',
    ],
    [
      'trecho vazio com ato conhecido',
      { anotacao: { ...caso.anotacao, trecho: '' } },
      'o trecho anotado precisa ser literal do teor (vazio só em "desconhecido")',
    ],
    ['revisor igual ao anotador', { revisor: 'adv-01' }, 'o revisor precisa ser outra pessoa'],
    [
      'caso real sem conferência',
      { anonimizacaoConferidaPor: null },
      'caso real sem conferência humana da anonimização',
    ],
  ])('%s', (_caso, mudanca, problema) => {
    expect(verificar({ ...caso, ...mudanca })).toEqual([{ arquivo: 'caso-0001.json', problema }]);
  });

  it('fora do formato mostra só os campos, nunca o valor', () => {
    const [problema] = verificar({ ...caso, anotador: 'Fulano de Tal', extra: 1 });
    expect(problema?.problema).toBe('fora do formato: anotador, (raiz)');
  });

  it('id repetido e arquivo com nome diferente do id', () => {
    expect(
      verificarConjunto([
        { arquivo: 'caso-0001.json', conteudo: caso },
        { arquivo: 'outro.json', conteudo: caso },
      ]),
    ).toEqual([
      { arquivo: 'outro.json', problema: 'id "caso-0001" repetido (também em caso-0001.json)' },
      { arquivo: 'outro.json', problema: 'o arquivo deve se chamar <id>.json' },
    ]);
  });
});
