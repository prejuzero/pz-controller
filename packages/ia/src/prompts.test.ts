import { fileURLToPath } from 'node:url';

import { ErroPermanente } from '@pz/integracoes';
import { Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { origemIa } from './origem.js';
import { hashDoPrompt, problemasDeVersao, RegistroDePrompts } from './prompts.js';

import type { ResultadoDaTarefa } from './plataforma.js';
import type { ArquivoDePrompt } from './prompts.js';

const DIRETORIO = fileURLToPath(new URL('../prompts', import.meta.url));

// Prompt FICTÍCIO: só exercita o registro.
const base = {
  tarefa: 'teste',
  versao: '1.1.0',
  sistema: 'Sistema.',
  usuario: 'Texto: {{texto}} ({{origem}})',
};
const arquivo = (parcial: Partial<ArquivoDePrompt> = {}): ArquivoDePrompt => {
  const conteudo = { ...base, ...parcial };
  return {
    ...conteudo,
    changelog: parcial.changelog ?? [
      { versao: '1.0.0', data: '2026-10-01', mudanca: 'inicial', hash: '0'.repeat(64) },
      { versao: '1.1.0', data: '2026-10-07', mudanca: 'ajuste', hash: hashDoPrompt(conteudo) },
    ],
  };
};

describe('registro de prompts versionados (HU58)', () => {
  it('os prompts do repositório carregam, com versão no changelog e hash em dia', () => {
    const registro = RegistroDePrompts.doDiretorio(DIRETORIO);
    expect(registro.versao('classificar-ato')).toMatch(/^classificar-ato@\d+\.\d+\.\d+$/);
    expect(registro.versao('resumir-publicacao')).toMatch(/^resumir-publicacao@/);
  });

  it('mudar o texto sem nova versão no changelog é recusado', () => {
    const alterado = { ...arquivo(), sistema: 'Sistema alterado.' };
    expect(problemasDeVersao(alterado)).toEqual([
      'teste: conteúdo mudou sem nova versão no changelog (1.1.0)',
    ]);
    expect(() => new RegistroDePrompts([alterado])).toThrow(/sem nova versão/);
    expect(problemasDeVersao({ ...arquivo(), versao: '2.0.0' })).toEqual([
      'teste: changelog sem a versão 2.0.0',
    ]);
    expect(() => new RegistroDePrompts([arquivo(), arquivo()])).toThrow(/duplicado/);
  });

  it('monta o prompt com a versão da tarefa e todas as variáveis', () => {
    const registro = new RegistroDePrompts([arquivo()]);
    expect(registro.montar('teste', { texto: 'FICTÍCIO', origem: 'DJEN' })).toEqual({
      versao: 'teste@1.1.0',
      sistema: 'Sistema.',
      mensagens: [{ papel: 'usuario', conteudo: 'Texto: FICTÍCIO (DJEN)' }],
    });
  });

  it('variável faltando ou sobrando e tarefa sem prompt são erros', () => {
    const registro = new RegistroDePrompts([arquivo()]);
    expect(() => registro.montar('teste', { texto: 'x' })).toThrow(/faltando \[origem\]/);
    expect(() => registro.montar('teste', { texto: 'x', origem: 'y', extra: 'z' })).toThrow(
      /sobrando \[extra\]/,
    );
    expect(() => registro.montar('outra', {})).toThrow(ErroPermanente);
  });
});

describe('origem da sugestão (HU58)', () => {
  const resultado = {
    modelo: 'modelo-a1',
    provedor: 'a',
    versaoDoPrompt: 'teste@1.1.0',
    versaoDaConfiguracao: '2026-10-07.1',
  } as ResultadoDaTarefa<unknown>;
  const agora = Instant.deIso('2026-10-07T12:00:00Z');

  it('identifica modelo, provedor, prompt, configuração e confiança', () => {
    expect(origemIa(resultado, agora, 0.91)).toEqual({
      modelo: 'modelo-a1',
      provedor: 'a',
      versaoPrompt: 'teste@1.1.0',
      versaoConfiguracao: '2026-10-07.1',
      confianca: 0.91,
      geradoEm: '2026-10-07T12:00:00.000Z',
    });
    expect(origemIa(resultado, agora).confianca).toBeNull();
    expect(() => origemIa(resultado, agora, 1.2)).toThrow(RangeError);
  });
});
