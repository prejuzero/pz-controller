import { hashDoPrompt, PlataformaIa, RegistroDePrompts } from '@pz/ia';
import { ErroSaidaInvalida, ErroTransitorio } from '@pz/integracoes';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsultarResumo, ResumirPublicacao } from '../application/resumir-publicacao.js';

import { ResumosEmMemoria } from './em-memoria.js';
import { ResumidorIaPlataforma, TAREFA_DO_RESUMO } from './resumidor-ia-plataforma.js';

import type { RespostaDoResumo } from '../domain/resumo.js';
import type { ContadorDeUsoDeIa } from '@pz/ia';
import type { ProvedorIA, RespostaIA } from '@pz/integracoes';

// Prompt e teor FICTÍCIOS (o prompt real fica em packages/ia/prompts).
const sistema = 'Resuma (fictício).';
const usuario = '<publicacao>{{publicacao}}</publicacao>';
const prompts = new RegistroDePrompts([
  {
    tarefa: TAREFA_DO_RESUMO,
    versao: '9.9.9',
    sistema,
    usuario,
    externas: ['publicacao'],
    changelog: [
      {
        versao: '9.9.9',
        data: '2026-11-06',
        mudanca: 'teste',
        hash: hashDoPrompt({ sistema, usuario }),
      },
    ],
  },
]);
const TENANT = gerarUuidV7();
const CONTEUDO = gerarUuidV7();
const TEOR = 'Intime-se a parte autora para manifestar-se sobre a contestação em 02/03/2027.';

function plataforma(gerar: ProvedorIA['gerarEstruturado'], orcamento = 0) {
  const contador: ContadorDeUsoDeIa = {
    usoNoMes: () => Promise.resolve(orcamento),
    registrar: () => Promise.resolve(),
  };
  return new PlataformaIa(
    {
      versao: 'teste',
      fonteDosPrecos: 'tabela fictícia',
      precos: { 'modelo-ficticio': { entrada: 1, saida: 5, cacheLido: 0.1 } },
      tarefas: {
        [TAREFA_DO_RESUMO]: {
          descricao: 'teste',
          modelos: [{ provedor: 'falso', modelo: 'modelo-ficticio' }],
          maxTokensSaida: 100,
          cachePrompt: true,
          lote: false,
          saidaSemDatas: { excetoCampos: ['trechos'] },
          orcamentoMensalTokens: 1000,
        },
      },
    },
    new Map([
      ['falso', { gerarEstruturado: gerar, saude: () => Promise.reject(new Error('não usado')) }],
    ]),
    {
      contador,
      relogio: new FixedClock(Instant.deIso('2026-11-06T12:00:00Z')),
      aoAlertar: () => undefined,
    },
  );
}

const resposta = <T>(saida: T): RespostaIA<T> => ({
  saida,
  modelo: 'modelo-ficticio',
  uso: { tokensEntrada: 1, tokensSaida: 1, tokensCacheLidos: 0 },
  chamadasDeFerramenta: [],
});

const SAIDA = {
  resumo: 'Pede que a parte autora se manifeste sobre a contestação; há data no texto original.',
  providencia: 'Manifestar-se sobre a contestação.',
  // O trecho literal pode ter a data: é cópia do teor, conferida no domínio.
  trechos: ['manifestar-se sobre a contestação em 02/03/2027'],
};

describe('resumidor pela plataforma de IA (HU62)', () => {
  it('monta o prompt com o teor isolado e devolve a saída com versão e modelo', async () => {
    let enviado = '';
    const r = await new ResumidorIaPlataforma(
      plataforma((p, schema) => {
        enviado = p.mensagens[0]?.conteudo ?? '';
        return Promise.resolve(resposta(schema.parse(SAIDA)));
      }),
      prompts,
    ).resumir(TEOR, TENANT);
    expect(r).toEqual({
      tipo: 'ok',
      ...SAIDA,
      versaoPrompt: `${TAREFA_DO_RESUMO}@9.9.9`,
      modelo: 'modelo-ficticio',
    });
    expect(enviado).toContain('Intime-se a parte autora');
  });

  it('data no resumo, saída inválida e orçamento esgotado viram respostas; falha passageira sobe', async () => {
    const resumir = (gerar: ProvedorIA['gerarEstruturado'], orcamento?: number) =>
      new ResumidorIaPlataforma(plataforma(gerar, orcamento), prompts).resumir(TEOR, TENANT);
    expect(
      await resumir((_p, schema) =>
        Promise.resolve(resposta(schema.parse({ ...SAIDA, resumo: 'Vence em 15/03/2027.' }))),
      ),
    ).toEqual({ tipo: 'invalida' });
    expect(await resumir(() => Promise.reject(new ErroSaidaInvalida('x', 'falso')))).toEqual({
      tipo: 'invalida',
    });
    expect(await resumir(() => Promise.reject(new Error('não chamado')), 5000)).toEqual({
      tipo: 'sem-orcamento',
    });
    await expect(
      resumir(() => Promise.reject(new ErroTransitorio('caiu', 'falso'))),
    ).rejects.toThrow('caiu');
  });
});

describe('resumir publicação (HU62)', () => {
  const evento = { tenantId: TENANT, payload: { conteudoId: CONTEUDO } };
  const teores = (teor: string | undefined) => ({ teor: () => Promise.resolve(teor) });
  const resumidor = (r: RespostaDoResumo) => ({ resumir: () => Promise.resolve(r) });
  const ok: RespostaDoResumo = {
    tipo: 'ok',
    ...SAIDA,
    modelo: 'modelo-ficticio',
    versaoPrompt: 'resumir-publicacao@0.3.0',
  };

  it('gera uma vez por conteúdo e só o "ok" é exibido', async () => {
    const resumos = new ResumosEmMemoria();
    const resumir = new ResumirPublicacao(teores(TEOR), resumos, resumidor(ok));
    expect(await resumir.executar(null, evento)).toBe('gerado');
    expect(await resumir.executar(null, evento)).toBe('ja-existia');
    expect(await new ConsultarResumo(resumos).executar(null, CONTEUDO)).toMatchObject({
      situacao: 'ok',
      texto: SAIDA.resumo,
    });
  });

  it('trecho fora do teor vai para revisão e não aparece; sem IA ou sem orçamento não grava', async () => {
    const resumos = new ResumosEmMemoria();
    const inventado = { ...ok, trechos: ['a parte ré foi condenada a pagar'] };
    expect(
      await new ResumirPublicacao(teores(TEOR), resumos, resumidor(inventado)).executar(
        null,
        evento,
      ),
    ).toBe('em-revisao');
    expect(await new ConsultarResumo(resumos).executar(null, CONTEUDO)).toBeUndefined();

    const vazio = new ResumosEmMemoria();
    expect(await new ResumirPublicacao(teores(TEOR), vazio).executar(null, evento)).toBe('sem-ia');
    expect(
      await new ResumirPublicacao(
        teores(TEOR),
        vazio,
        resumidor({ tipo: 'sem-orcamento' }),
      ).executar(null, evento),
    ).toBe('sem-orcamento');
    expect(vazio.itens.size).toBe(0);
    await expect(
      new ResumirPublicacao(teores(undefined), vazio, resumidor(ok)).executar(null, evento),
    ).rejects.toThrow('não encontrado');
    // Outro consumidor gravou entre a checagem e a gravação.
    const corrida = new ResumosEmMemoria();
    const gravar = corrida.gravar.bind(corrida);
    corrida.existe = () => Promise.resolve(false);
    corrida.gravar = (tx, id, r) => gravar(tx, id, r).then(() => false);
    expect(
      await new ResumirPublicacao(teores(TEOR), corrida, resumidor(ok)).executar(null, {
        ...evento,
        payload: { conteudoId: gerarUuidV7() },
      }),
    ).toBe('ja-existia');
  });
});
