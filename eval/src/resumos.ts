import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decidirResumo, ResumidorIaPlataforma } from '@pz/classificacao';
import { comProvedorAlternativo, configuracaoPadrao, PlataformaIa, promptsPadrao } from '@pz/ia';
import { z } from 'zod';

import { SemGravacao, type Gravacao, type ProvedorDaAvaliacao } from './gravacoes.js';
import { META_DE_ACERTO } from './relatorio.js';

import type { Uuid } from '@pz/kernel';

export const PASTA_DOS_CASOS_DE_RESUMO = fileURLToPath(new URL('../resumos', import.meta.url));
export const PROVEDOR_DO_RESUMO = 'avaliacao';

/**
 * Caso da avaliação do resumo (HU62): o teor e o que o resumo precisa dizer. Só teor fictício ou
 * anonimizado (CLAUDE.md, seção 3). Meta provisória de 98% (decisão do usuário em 06/11/2026).
 */
export const CasoDeResumo = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    origem: z.enum(['ficticio', 'real-anonimizado']),
    teor: z.string().min(1).max(20_000),
    esperado: z
      .object({
        /** Termos que o resumo ou a providência precisam citar (sem diferenciar maiúsculas). */
        termos: z.array(z.string().min(1)).min(1),
        /** Se há providência para o advogado (ex.: intimação para manifestar-se). */
        temProvidencia: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type CasoDeResumo = z.infer<typeof CasoDeResumo>;

export function lerCasosDeResumo(pasta = PASTA_DOS_CASOS_DE_RESUMO): CasoDeResumo[] {
  return readdirSync(pasta)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => CasoDeResumo.parse(JSON.parse(readFileSync(join(pasta, n), 'utf8'))));
}

export interface ResultadoDoResumo {
  readonly caso: CasoDeResumo;
  readonly situacao:
    'acerto' | 'termo-ausente' | 'providencia-errada' | 'revisao-manual' | 'sem-gravacao';
  readonly detalhe?: string;
  readonly chamadas: readonly Gravacao[];
}

const TENANT = '00000000-0000-7000-8000-000000000000' as Uuid;

/**
 * Roda cada teor pelo resumidor e pela decisão da produção (schema, guardrail sem datas, trechos
 * literais); só o provedor muda (gravações no CI, a API com `--gravar`).
 */
export async function avaliarResumos(
  casos: readonly CasoDeResumo[],
  provedor: ProvedorDaAvaliacao,
  modelo: string,
): Promise<ResultadoDoResumo[]> {
  const configuracao = comProvedorAlternativo(configuracaoPadrao(), {
    provedor: PROVEDOR_DO_RESUMO,
    modelo,
    preco: { entrada: 0, saida: 0, cacheLido: 0 },
    fonteDoPreco: 'avaliação do resumo (custo não estimado)',
  });
  const plataforma = new PlataformaIa(configuracao, new Map([[PROVEDOR_DO_RESUMO, provedor]]));
  const resumidor = new ResumidorIaPlataforma(plataforma, promptsPadrao());
  const resultados: ResultadoDoResumo[] = [];
  for (const caso of casos) {
    provedor.casoAtual = caso.id;
    const antes = provedor.chamadas.length;
    const chamadas = () => provedor.chamadas.slice(antes);
    let resumo;
    try {
      resumo = decidirResumo(caso.teor, await resumidor.resumir(caso.teor, TENANT));
    } catch (erro) {
      if (!(erro instanceof SemGravacao)) throw erro;
      resultados.push({ caso, situacao: 'sem-gravacao', chamadas: chamadas() });
      continue;
    }
    if (resumo?.situacao !== 'ok') {
      resultados.push({
        caso,
        situacao: 'revisao-manual',
        detalhe: resumo?.motivo ?? 'sem orçamento',
        chamadas: chamadas(),
      });
      continue;
    }
    const dito = `${resumo.texto ?? ''} ${resumo.providencia ?? ''}`.toLocaleLowerCase('pt-BR');
    const ausentes = caso.esperado.termos.filter(
      (t) => !dito.includes(t.toLocaleLowerCase('pt-BR')),
    );
    const situacao =
      ausentes.length > 0
        ? 'termo-ausente'
        : (resumo.providencia !== null) !== caso.esperado.temProvidencia
          ? 'providencia-errada'
          : 'acerto';
    resultados.push({
      caso,
      situacao,
      ...(ausentes.length === 0 ? {} : { detalhe: `faltou: ${ausentes.join(', ')}` }),
      chamadas: chamadas(),
    });
  }
  return resultados;
}

/** Relatório em Markdown. Como nos outros gates, só casos reais contam para a meta de 98%. */
export function relatorioDeResumos(
  resultados: readonly ResultadoDoResumo[],
  versaoDoPrompt: string,
  modelo: string,
): { readonly markdown: string; readonly aprovado: boolean; readonly aviso?: string } {
  const acertos = resultados.filter((r) => r.situacao === 'acerto').length;
  const semGravacao = resultados.filter((r) => r.situacao === 'sem-gravacao').length;
  const doReal = resultados.filter((r) => r.caso.origem === 'real-anonimizado');
  const pct = resultados.length === 0 ? 0 : (100 * acertos) / resultados.length;
  const linhas = [
    '## Avaliação do resumo (HU62)',
    '',
    `Prompt \`${versaoDoPrompt}\`, modelo \`${modelo}\`: **${String(acertos)}/${String(resultados.length)}** acertos (${pct.toFixed(1)}%).`,
    '',
    '| Caso | Origem | Situação | Detalhe |',
    '| --- | --- | --- | --- |',
    ...resultados.map(
      (r) =>
        `| ${r.caso.id} | ${r.caso.origem} | ${r.situacao} | ${(r.detalhe ?? '').replace(/\|/g, '/').slice(0, 120)} |`,
    ),
    '',
  ];
  const acertoReal =
    doReal.length === 0 ? 1 : doReal.filter((r) => r.situacao === 'acerto').length / doReal.length;
  const avisos = [
    ...(doReal.length === 0
      ? ['Só casos fictícios: o resultado exercita o fluxo e não conta para a meta de 98%.']
      : []),
    ...(semGravacao > 0
      ? [
          `${String(semGravacao)} caso(s) sem gravação: rode "pnpm --filter @pz/eval avaliar-resumos --gravar".`,
        ]
      : []),
  ];
  return {
    markdown: linhas.join('\n'),
    aprovado: doReal.every((r) => r.situacao !== 'sem-gravacao') && acertoReal >= META_DE_ACERTO,
    ...(avisos.length === 0 ? {} : { aviso: avisos.join(' ') }),
  };
}
