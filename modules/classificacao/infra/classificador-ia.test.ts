import { hashDoPrompt, PlataformaIa, RegistroDePrompts } from '@pz/ia';
import { ErroSaidaInvalida, ErroTransitorio } from '@pz/integracoes';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ClassificadorIaPlataforma, TAREFA } from './classificador-ia-plataforma.js';

import type { ContadorDeUsoDeIa } from '@pz/ia';
import type { ProvedorIA, RespostaIA } from '@pz/integracoes';

// Prompt e teor FICTÍCIOS (o prompt real fica em packages/ia/prompts).
const sistema = 'Classifique (fictício).';
const usuario = 'Taxonomia:\n{{taxonomia}}\n<publicacao>{{publicacao}}</publicacao>';
const prompts = new RegistroDePrompts([
  {
    tarefa: TAREFA,
    versao: '9.9.9',
    sistema,
    usuario,
    externas: ['publicacao'],
    changelog: [
      {
        versao: '9.9.9',
        data: '2026-10-08',
        mudanca: 'teste',
        hash: hashDoPrompt({ sistema, usuario }),
      },
    ],
  },
]);
const TENANT = gerarUuidV7();
const ENTRADA = {
  teor: 'Ante o exposto, JULGO PROCEDENTE o pedido.',
  taxonomia: [{ codigo: 'sentenca', nome: 'Sentença', descricao: 'decide o mérito' }],
};

function plataforma(gerar: ProvedorIA['gerarEstruturado'], orcamento?: number) {
  const provedor: ProvedorIA = {
    gerarEstruturado: gerar,
    saude: () => Promise.reject(new Error('não usado')),
  };
  const contador: ContadorDeUsoDeIa = {
    usoNoMes: () => Promise.resolve(orcamento ?? 0),
    registrar: () => Promise.resolve(),
  };
  return new PlataformaIa(
    {
      versao: 'teste',
      fonteDosPrecos: 'tabela fictícia',
      precos: { 'modelo-ficticio': { entrada: 1, saida: 5, cacheLido: 0.1 } },
      tarefas: {
        [TAREFA]: {
          descricao: 'teste',
          modelos: [{ provedor: 'falso', modelo: 'modelo-ficticio' }],
          maxTokensSaida: 100,
          cachePrompt: true,
          lote: false,
          saidaSemDatas: { excetoCampos: ['trecho'] },
          orcamentoMensalTokens: 1000,
        },
      },
    },
    new Map([['falso', provedor]]),
    {
      contador,
      relogio: new FixedClock(Instant.deIso('2026-10-08T12:00:00Z')),
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

describe('classificador pela plataforma de IA (HU21)', () => {
  it('monta o prompt com taxonomia e teor isolado e devolve a saída com versão e modelo', async () => {
    let enviado = '';
    const gerar: ProvedorIA['gerarEstruturado'] = (prompt, schema) => {
      enviado = prompt.mensagens[0]?.conteudo ?? '';
      return Promise.resolve(
        resposta(
          schema.parse({ tipoAto: 'sentenca', confianca: 0.97, trecho: 'JULGO PROCEDENTE' }),
        ),
      );
    };
    const r = await new ClassificadorIaPlataforma(plataforma(gerar), prompts).classificar(
      ENTRADA,
      TENANT,
    );
    expect(r).toEqual({
      tipo: 'ok',
      tipoAto: 'sentenca',
      confianca: 0.97,
      trecho: 'JULGO PROCEDENTE',
      versaoPrompt: `${TAREFA}@9.9.9`,
      modelo: 'modelo-ficticio',
    });
    expect(enviado).toContain('sentenca: Sentença (decide o mérito)');
    expect(enviado).toContain('JULGO PROCEDENTE');
  });

  it('saída inválida, data na saída e orçamento esgotado viram respostas; falha passageira sobe', async () => {
    const classificar = (gerar: ProvedorIA['gerarEstruturado'], orcamento?: number) =>
      new ClassificadorIaPlataforma(plataforma(gerar, orcamento), prompts).classificar(
        ENTRADA,
        TENANT,
      );
    expect(await classificar(() => Promise.reject(new ErroSaidaInvalida('x', 'falso')))).toEqual({
      tipo: 'invalida',
    });
    expect(
      await classificar((_p, schema) =>
        Promise.resolve(
          resposta(schema.parse({ tipoAto: 'sentenca 15/10/2026', confianca: 0.9, trecho: '' })),
        ),
      ),
    ).toEqual({ tipo: 'invalida' });
    expect(await classificar(() => Promise.reject(new Error('não chamado')), 1000)).toEqual({
      tipo: 'sem-orcamento',
    });
    await expect(
      classificar(() => Promise.reject(new ErroTransitorio('fora', 'falso'))),
    ).rejects.toBeInstanceOf(ErroTransitorio);
  });
});
