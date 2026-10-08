import { hashDoPrompt, RegistroDePrompts } from '@pz/ia';
import { describe, expect, it } from 'vitest';

import { avaliar } from './avaliar.js';
import { GravadorDeProvedor, ProvedorGravado, type ArquivoDeGravacoes } from './gravacoes.js';
import { montarRelatorio, type Relatorio } from './relatorio.js';
import { caso, ProvedorDeMentira, referencia, relogio } from './teste-apoio.js';

import type { CasoDeAvaliacao } from './caso.js';
import type { ConfiguracaoDasTarefas } from '@pz/ia';

/**
 * QA da HU22 (PZ-163): o gate bloqueia regressão de prompt. Conjunto fictício marcado como
 * real e revisado só aqui, em memória, para exercitar a meta (nada disto vai para `casos/`).
 */
const conjunto: CasoDeAvaliacao[] = Array.from({ length: 50 }, (_, i) =>
  i % 2 === 0
    ? caso(
        `qa-${String(i)}`,
        `Intime-se a parte ${String(i)} sobre os documentos.`,
        'intimacao-manifestacao',
      )
    : caso(
        `qa-${String(i)}`,
        `Certifico que conferi as peças do volume ${String(i)}.`,
        'desconhecido',
      ),
);

const USUARIO = 'Taxonomia:\n{{taxonomia}}\n\n<publicacao>\n{{publicacao}}\n</publicacao>';

const prompts = (versao: string, sistema: string) =>
  new RegistroDePrompts([
    {
      tarefa: 'classificar-ato',
      versao,
      sistema,
      usuario: USUARIO,
      externas: ['publicacao'],
      changelog: [
        {
          versao,
          data: '2026-10-08',
          mudanca: 'QA',
          hash: hashDoPrompt({ sistema, usuario: USUARIO }),
        },
      ],
    },
  ]);
const v1 = prompts('1.0.0', 'Classifique o ato.');
const v2 = prompts('1.1.0', 'Classifique o ato. Seja mais conservador.');

const configuracao = { precos: {} } as unknown as ConfiguracaoDasTarefas;
const relatorio = async (
  provedor: GravadorDeProvedor | ProvedorGravado,
  registro: RegistroDePrompts,
): Promise<Relatorio> =>
  montarRelatorio(
    await avaliar(conjunto, referencia, provedor, relogio, registro),
    configuracao,
    {
      versaoDoPrompt: registro.versao('classificar-ato'),
      versaoDaConfiguracao: 'c',
      versaoDaTaxonomia: 't',
      versaoDasRegras: 'r',
    },
    false,
  );

async function gravar(
  registro: RegistroDePrompts,
  regredido: boolean,
): Promise<ArquivoDeGravacoes> {
  const gravador = new GravadorDeProvedor(new ProvedorDeMentira(regredido), relogio);
  await avaliar(conjunto, referencia, gravador, relogio, registro);
  return gravador.gravacoes;
}

describe('QA do gate de qualidade da IA (PZ-163)', () => {
  it('linha de base: prompt atual gravado e reproduzido passa com 100%', async () => {
    const r = await relatorio(new ProvedorGravado(await gravar(v1, false), relogio), v1);
    expect(r.meta).toMatchObject({ casos: 50, acuracia: 1 });
    expect(r.veredito).toEqual({ aprovado: true });
  });

  it('prompt alterado sem regravar: o CI bloqueia (gravações da versão anterior não valem)', async () => {
    const r = await relatorio(new ProvedorGravado(await gravar(v1, false), relogio), v2);
    expect(r.meta.semGravacao).toBe(50);
    expect(r.veredito).toMatchObject({
      aprovado: false,
      motivo: expect.stringContaining('sem resposta gravada') as unknown,
    });
  });

  it('regressão proposital no prompt, regravada: o CI bloqueia abaixo de 98%', async () => {
    const r = await relatorio(new ProvedorGravado(await gravar(v2, true), relogio), v2);
    expect(r.meta.acuracia).toBe(0.5);
    expect(r.veredito).toMatchObject({
      aprovado: false,
      motivo: expect.stringContaining('50,0% abaixo da meta de 98,0%') as unknown,
    });
    expect(r.erros).toHaveLength(25);
  });

  it('um erro em 50 (98%) ainda passa; dois (96%) bloqueiam', async () => {
    const gravacoes = await gravar(v1, false);
    const comErros = (n: number) =>
      conjunto.map((c, i) =>
        i < 2 * n && i % 2 === 0 ? { ...c, anotacao: { ...c.anotacao, tipoAto: 'citacao' } } : c,
      );
    const medir = async (casos: CasoDeAvaliacao[]) =>
      montarRelatorio(
        await avaliar(casos, referencia, new ProvedorGravado(gravacoes, relogio), relogio, v1),
        configuracao,
        {
          versaoDoPrompt: 'v',
          versaoDaConfiguracao: 'c',
          versaoDaTaxonomia: 't',
          versaoDasRegras: 'r',
        },
        false,
      ).veredito;
    expect(await medir(comErros(1))).toEqual({ aprovado: true });
    expect(await medir(comErros(2))).toMatchObject({ aprovado: false });
  });
});
