import { CatalogoDeFerramentas, promptsPadrao } from '@pz/ia';
import { ok } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { EscolherFerramenta, TAREFA_DE_ESCOLHA } from './escolher-ferramenta.js';
import { ferramentasDoAssistente } from './ferramentas.js';

import type { FontesDasFerramentas } from './ferramentas.js';
import type { ContextoDaFerramenta, PlataformaIa } from '@pz/ia';
import type { PromptIA } from '@pz/integracoes';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS.
const contexto: ContextoDaFerramenta = {
  tenantId: '01a10e00-0000-7000-8000-0000000ae001' as Uuid,
  usuarioId: '01a10e00-0000-7000-8000-0000000ae002' as Uuid,
  permissoes: new Set(['prazos:ler']),
  canal: 'portal',
};
const fontes = {} as FontesDasFerramentas;
const catalogo = new CatalogoDeFerramentas(ferramentasDoAssistente(fontes), () =>
  Promise.resolve(),
);

function plataforma(
  saida: unknown,
  prompts: PromptIA[] = [],
): Pick<PlataformaIa, 'executarTarefa'> {
  return {
    executarTarefa: (tarefa, prompt) => {
      expect(tarefa).toBe(TAREFA_DE_ESCOLHA);
      prompts.push(prompt);
      return Promise.resolve({
        saida,
        modelo: 'modelo-ficticio',
        uso: { tokensEntrada: 1, tokensSaida: 1, tokensCacheLidos: 0 },
        chamadasDeFerramenta: [],
        tarefa,
        provedor: 'ficticio',
        versaoDoPrompt: prompt.versao,
        versaoDaConfiguracao: 'v',
        falhasAnteriores: [],
      }) as never;
    },
  };
}

describe('escolha da ferramenta pelo modelo (HU59)', () => {
  it('só as ferramentas permitidas vão no prompt; argumentos validados e normalizados', async () => {
    const prompts: PromptIA[] = [];
    const escolher = new EscolherFerramenta(
      plataforma(
        {
          ferramenta: 'buscar_prazos',
          argumentos: { tribunal: 'TJXA', periodo: { atalho: 'esta-semana' } },
          motivo: 'pergunta sobre prazos da semana',
        },
        prompts,
      ),
      promptsPadrao(),
      catalogo,
    );
    const r = await escolher.executar('Quais prazos do TJXA vencem esta semana?', contexto);
    expect(r.ok && r.valor).toMatchObject({
      ferramenta: 'buscar_prazos',
      argumentos: { tribunal: 'TJXA', periodo: { atalho: 'esta-semana' }, limite: 20 },
      versaoDoPrompt: 'escolher-ferramenta@0.1.0',
    });
    const texto = prompts[0]?.mensagens[0]?.conteudo ?? '';
    expect(texto).toContain('buscar_prazos');
    expect(texto).not.toContain('buscar_publicacoes'); // sem publicacoes:ler
  });

  it('nenhuma ferramenta serve: devolve null sem argumentos', async () => {
    const r = await new EscolherFerramenta(
      plataforma({ ferramenta: null, argumentos: {}, motivo: 'fora do escopo' }),
      promptsPadrao(),
      catalogo,
    ).executar('Qual a capital da França?', contexto);
    expect(r.ok && r.valor).toMatchObject({ ferramenta: null, argumentos: {} });
  });

  it('ferramenta indisponível ou argumento fora do schema: escolha inválida', async () => {
    for (const saida of [
      { ferramenta: 'buscar_publicacoes', argumentos: {}, motivo: 'x' },
      { ferramenta: 'nao_existe', argumentos: {}, motivo: 'x' },
      { ferramenta: 'buscar_prazos', argumentos: { tenantId: 'outro' }, motivo: 'x' },
    ]) {
      const r = await new EscolherFerramenta(plataforma(saida), promptsPadrao(), catalogo).executar(
        'pergunta FICTÍCIA',
        contexto,
      );
      expect(!r.ok && r.erro.codigo).toBe('escolha-invalida');
    }
    expect(catalogo.validarEntrada('buscar_prazos', {}, contexto)).toEqual(ok({ limite: 20 }));
  });
});
