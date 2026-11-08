import { describe, expect, it } from 'vitest';

import { lerPlanilhaDeProcessos, MAXIMO_DE_LINHAS_DA_IMPORTACAO } from './importacao.js';

// Números FICTÍCIOS com dígito verificador válido.
const A = '0000001-68.2026.8.26.0100';
const B = '1234567-03.2025.5.02.0001';

const ler = (csv: string) => {
  const r = lerPlanilhaDeProcessos(csv);
  if (!r.ok) throw r.erro;
  return r.valor;
};

describe('planilha de processos (HU42)', () => {
  it('lê as colunas em qualquer ordem, com ; ou , e sigilo por sim/não', () => {
    expect(ler(`comarca;numeroCnj;sigiloso;orgao\nSão Paulo;${A};sim;1ª Vara\n;${B};;`)).toEqual([
      {
        linha: 2,
        processo: {
          numeroCnj: '00000016820268260100',
          orgao: '1ª Vara',
          comarca: 'São Paulo',
          sigiloso: true,
        },
        problemas: [],
      },
      {
        linha: 3,
        processo: {
          numeroCnj: '12345670320255020001',
          orgao: null,
          comarca: null,
          sigiloso: false,
        },
        problemas: [],
      },
    ]);
    expect(ler(`numeroCnj\n${A}`)[0]?.processo?.sigiloso).toBe(false);
    expect(ler(`numeroCnj,sigiloso\n${A},Não`)[0]?.problemas).toEqual([]);
  });

  it('aponta os problemas por linha: número inválido, repetido, sigilo, texto longo, colunas a mais', () => {
    const linhas = ler(
      `numeroCnj;sigiloso;orgao\n${A};talvez;\n0000001-00.2026.8.26.0100;;\n${A};;\n${B};;${'x'.repeat(201)}\n${B};;;extra`,
    );
    expect(
      linhas.map((l) => [l.linha, l.processo === undefined, l.problemas.map((p) => p.campo)]),
    ).toEqual([
      [2, true, ['sigiloso']],
      [3, true, ['numeroCnj']],
      [4, true, ['numeroCnj']],
      [5, true, ['orgao']],
      [6, true, ['csv', 'numeroCnj']],
    ]);
    expect(linhas[2]?.problemas[0]?.mensagem).toBe('Processo repetido no arquivo (linha 2).');
  });

  it('recusa o arquivo: sem numeroCnj, coluna desconhecida ou repetida, vazio ou grande demais', () => {
    for (const csv of [
      'orgao\nx',
      `numeroCnj;cliente\n${A};x`,
      `numeroCnj;numeroCnj\n${A};${A}`,
      'numeroCnj',
      '',
      `numeroCnj\n${`${A}\n`.repeat(MAXIMO_DE_LINHAS_DA_IMPORTACAO + 1)}`,
    ]) {
      expect(lerPlanilhaDeProcessos(csv).ok).toBe(false);
    }
  });
});
