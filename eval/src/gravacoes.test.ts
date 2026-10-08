import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SaidaDaClassificacao } from '@pz/classificacao';
import { ErroPermanente, ErroTransitorio, type PromptIA } from '@pz/integracoes';
import { describe, expect, it } from 'vitest';

import {
  arquivoDasGravacoes,
  chaveDaChamada,
  GravadorDeProvedor,
  lerGravacoes,
  ProvedorGravado,
  SemGravacao,
  type Gravacao,
} from './gravacoes.js';
import { ProvedorDeMentira, relogio } from './teste-apoio.js';

const prompt = (conteudo: string): PromptIA => ({
  versao: 'classificar-ato@0.1.0',
  sistema: 'sistema',
  mensagens: [{ papel: 'usuario', conteudo }],
});
const opcoes = { modelo: 'claude-haiku-4-5', maxTokensSaida: 1024, temperatura: 0 };

describe('chave da chamada', () => {
  it('muda com o prompt, o modelo e os parâmetros; é estável para a mesma chamada', () => {
    const base = chaveDaChamada(prompt('a'), opcoes);
    expect(chaveDaChamada(prompt('a'), { ...opcoes })).toBe(base);
    expect(chaveDaChamada(prompt('b'), opcoes)).not.toBe(base);
    expect(chaveDaChamada({ ...prompt('a'), versao: 'x@0.2.0' }, opcoes)).not.toBe(base);
    expect(chaveDaChamada(prompt('a'), { ...opcoes, modelo: 'outro' })).not.toBe(base);
    expect(chaveDaChamada(prompt('a'), { ...opcoes, temperatura: 0.2 })).not.toBe(base);
    expect(chaveDaChamada(prompt('a'), { modelo: opcoes.modelo, maxTokensSaida: 1024 })).not.toBe(
      base,
    );
  });
});

describe('gravar e reproduzir', () => {
  it('grava a saída válida e a reproduz validada pelo schema', async () => {
    const gravador = new GravadorDeProvedor(new ProvedorDeMentira(), relogio);
    gravador.casoAtual = 'c1';
    const real = await gravador.gerarEstruturado(prompt('Intime-se'), SaidaDaClassificacao, opcoes);
    expect(gravador.chamadas).toEqual([
      expect.objectContaining({ caso: 'c1', modelo: opcoes.modelo, latenciaMs: 0 }),
    ]);
    const gravado = new ProvedorGravado(gravador.gravacoes, relogio);
    const repetida = await gravado.gerarEstruturado(
      prompt('Intime-se'),
      SaidaDaClassificacao,
      opcoes,
    );
    expect(repetida).toEqual(real);
    expect(gravado.chamadas).toHaveLength(1);
  });

  it('grava a saída inválida e a reproduz como erro permanente', async () => {
    const gravador = new GravadorDeProvedor(new ProvedorDeMentira(), relogio);
    await expect(
      gravador.gerarEstruturado(prompt('QUEBRA'), SaidaDaClassificacao, opcoes),
    ).rejects.toBeInstanceOf(ErroPermanente);
    const gravado = new ProvedorGravado(gravador.gravacoes, relogio);
    await expect(
      gravado.gerarEstruturado(prompt('QUEBRA'), SaidaDaClassificacao, opcoes),
    ).rejects.toThrow('fora do schema');
  });

  it('falha transitória sobe sem virar gravação', async () => {
    const gravador = new GravadorDeProvedor(new ProvedorDeMentira(), relogio);
    await expect(
      gravador.gerarEstruturado(prompt('REDE'), SaidaDaClassificacao, opcoes),
    ).rejects.toBeInstanceOf(ErroTransitorio);
    expect(gravador.gravacoes).toEqual({});
    expect(gravador.chamadas).toEqual([]);
  });

  it('chamada sem gravação lança SemGravacao com o modelo', async () => {
    const gravado = new ProvedorGravado({}, relogio);
    const erro = await gravado
      .gerarEstruturado(prompt('x'), SaidaDaClassificacao, opcoes)
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(SemGravacao);
    expect((erro as SemGravacao).modelo).toBe(opcoes.modelo);
  });

  it('saída gravada que não passa mais no schema vira erro permanente', async () => {
    const gravacao: Gravacao = {
      caso: 'c1',
      modelo: opcoes.modelo,
      latenciaMs: 10,
      resultado: {
        tipo: 'ok',
        saida: { tipoAto: 'citacao', confianca: 2, trecho: '' },
        modeloQueRespondeu: opcoes.modelo,
        uso: { tokensEntrada: 1, tokensSaida: 1, tokensCacheLidos: 0 },
      },
    };
    const gravado = new ProvedorGravado(
      { [chaveDaChamada(prompt('x'), opcoes)]: gravacao },
      relogio,
    );
    await expect(
      gravado.gerarEstruturado(prompt('x'), SaidaDaClassificacao, opcoes),
    ).rejects.toBeInstanceOf(ErroPermanente);
  });

  it('saúde dos dois provedores', async () => {
    await expect(new ProvedorGravado({}, relogio).saude()).resolves.toMatchObject({
      estado: 'operacional',
    });
    await expect(
      new GravadorDeProvedor(new ProvedorDeMentira(), relogio).saude(),
    ).resolves.toMatchObject({ estado: 'operacional' });
  });
});

describe('arquivo de gravações', () => {
  it('um arquivo por versão do prompt; ausente = vazio; conteúdo validado', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'pz-eval-'));
    const caminho = arquivoDasGravacoes('classificar-ato@0.1.0', pasta);
    expect(caminho).toBe(join(pasta, 'classificar-ato@0.1.0.json'));
    expect(lerGravacoes(caminho)).toEqual({});
    writeFileSync(caminho, JSON.stringify({ 'nao-e-hash': {} }));
    expect(() => lerGravacoes(caminho)).toThrow();
  });
});
