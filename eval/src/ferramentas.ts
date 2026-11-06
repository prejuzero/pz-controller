import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EscolherFerramenta, ferramentasDoAssistente } from '@pz/assistente';
import {
  CatalogoDeFerramentas,
  comProvedorAlternativo,
  configuracaoPadrao,
  PlataformaIa,
  promptsPadrao,
} from '@pz/ia';
import { ErroPermanente } from '@pz/integracoes';
import { z } from 'zod';

import { SemGravacao, type Gravacao, type ProvedorDaAvaliacao } from './gravacoes.js';
import { META_DE_ACERTO } from './relatorio.js';

import type { FontesDasFerramentas } from '@pz/assistente';
import type { ContextoDaFerramenta } from '@pz/ia';
import type { Uuid } from '@pz/kernel';

export const PASTA_DOS_CASOS_DE_FERRAMENTAS = fileURLToPath(
  new URL('../ferramentas', import.meta.url),
);
/** Id do provedor na configuração da avaliação: o modelo é o das gravações (ou o de gravar). */
export const PROVEDOR_DA_AVALIACAO = 'avaliacao';

/**
 * Caso da avaliação de uso das ferramentas (HU59): a pergunta e o que se espera da escolha. Só
 * perguntas fictícias ou anonimizadas: nada de dado real de escritório (CLAUDE.md, seção 3).
 */
export const CasoDeFerramenta = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    origem: z.enum(['ficticio', 'real-anonimizado']),
    pergunta: z.string().min(1).max(1000),
    /** Permissões de quem pergunta (padrão: as de leitura do advogado). */
    permissoes: z.array(z.string()).optional(),
    esperado: z
      .object({
        /** Ferramentas aceitas (`null`: nenhuma). Mais de uma quando a pergunta é ambígua. */
        ferramentas: z.array(z.string().nullable()).min(1),
        /** Argumentos que precisam estar presentes, com estes valores (os demais são livres). */
        argumentos: z.record(z.string(), z.unknown()).default({}),
      })
      .strict(),
  })
  .strict();
export type CasoDeFerramenta = z.infer<typeof CasoDeFerramenta>;

export function lerCasosDeFerramentas(pasta = PASTA_DOS_CASOS_DE_FERRAMENTAS): CasoDeFerramenta[] {
  return readdirSync(pasta)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => CasoDeFerramenta.parse(JSON.parse(readFileSync(join(pasta, n), 'utf8'))));
}

export interface ResultadoDaEscolha {
  readonly caso: CasoDeFerramenta;
  readonly situacao:
    'acerto' | 'ferramenta-errada' | 'argumentos-errados' | 'invalida' | 'sem-gravacao';
  readonly ferramenta?: string | null;
  readonly argumentos?: unknown;
  readonly detalhe?: string;
  readonly chamadas: readonly Gravacao[];
}

/** Cada valor esperado presente no obtido (objetos por chave; listas e primitivos por igualdade). */
export function contem(obtido: unknown, esperado: unknown): boolean {
  if (typeof esperado === 'object' && esperado !== null && !Array.isArray(esperado)) {
    if (typeof obtido !== 'object' || obtido === null) return false;
    return Object.entries(esperado).every(([k, v]) =>
      contem((obtido as Record<string, unknown>)[k], v),
    );
  }
  return JSON.stringify(obtido) === JSON.stringify(esperado);
}

const TENANT = '00000000-0000-7000-8000-000000000000' as Uuid;
const LEITURA = ['prazos:ler', 'publicacoes:ler', 'processos:ler'];

/**
 * Roda cada pergunta pelo caso de uso da produção (`EscolherFerramenta`) com o catálogo real e o
 * prompt versionado; só o provedor muda (gravações no CI, a API com `--gravar`). As ferramentas
 * não executam: a avaliação mede a escolha e os argumentos.
 */
export async function avaliarFerramentas(
  casos: readonly CasoDeFerramenta[],
  provedor: ProvedorDaAvaliacao,
  modelo: string,
): Promise<ResultadoDaEscolha[]> {
  const configuracao = comProvedorAlternativo(configuracaoPadrao(), {
    provedor: PROVEDOR_DA_AVALIACAO,
    modelo,
    preco: { entrada: 0, saida: 0, cacheLido: 0 },
    fonteDoPreco: 'avaliação de ferramentas (custo não estimado)',
  });
  const plataforma = new PlataformaIa(configuracao, new Map([[PROVEDOR_DA_AVALIACAO, provedor]]));
  const catalogo = new CatalogoDeFerramentas(
    ferramentasDoAssistente({} as FontesDasFerramentas),
    () => Promise.resolve(),
  );
  const escolher = new EscolherFerramenta(plataforma, promptsPadrao(), catalogo);
  const resultados: ResultadoDaEscolha[] = [];
  for (const caso of casos) {
    provedor.casoAtual = caso.id;
    const antes = provedor.chamadas.length;
    const contexto: ContextoDaFerramenta = {
      tenantId: TENANT,
      usuarioId: TENANT,
      permissoes: new Set(caso.permissoes ?? LEITURA),
      canal: 'portal',
    };
    const chamadas = () => provedor.chamadas.slice(antes);
    try {
      const r = await escolher.executar(caso.pergunta, contexto);
      if (!r.ok) {
        resultados.push({
          caso,
          situacao: 'invalida',
          detalhe: r.erro.message,
          chamadas: chamadas(),
        });
        continue;
      }
      const { ferramenta, argumentos } = r.valor;
      const situacao = !caso.esperado.ferramentas.includes(ferramenta)
        ? 'ferramenta-errada'
        : contem(argumentos, caso.esperado.argumentos)
          ? 'acerto'
          : 'argumentos-errados';
      resultados.push({ caso, situacao, ferramenta, argumentos, chamadas: chamadas() });
    } catch (erro) {
      if (erro instanceof SemGravacao) {
        resultados.push({ caso, situacao: 'sem-gravacao', chamadas: chamadas() });
        continue;
      }
      // Erro de integração (cota, rede, indisponível) não é resposta do modelo: derruba a rodada.
      if (!(erro instanceof ErroPermanente)) throw erro;
      // Saída do modelo fora do schema ou com data proibida: conta como inválida, não derruba.
      resultados.push({
        caso,
        situacao: 'invalida',
        detalhe: erro instanceof Error ? erro.message : String(erro),
        chamadas: chamadas(),
      });
    }
  }
  return resultados;
}

/** Relatório em Markdown: acerto geral e por caso. Só casos reais revisados contariam para meta. */
export function relatorioDeFerramentas(
  resultados: readonly ResultadoDaEscolha[],
  versaoDoPrompt: string,
  modelo: string,
): { readonly markdown: string; readonly aprovado: boolean; readonly aviso?: string } {
  const acertos = resultados.filter((r) => r.situacao === 'acerto').length;
  const semGravacao = resultados.filter((r) => r.situacao === 'sem-gravacao').length;
  const reais = resultados.filter((r) => r.caso.origem === 'real-anonimizado').length;
  const pct = resultados.length === 0 ? 0 : (100 * acertos) / resultados.length;
  const linhas = [
    `## Avaliação de uso das ferramentas (HU59)`,
    '',
    `Prompt \`${versaoDoPrompt}\`, modelo \`${modelo}\`: **${String(acertos)}/${String(resultados.length)}** acertos (${pct.toFixed(1)}%).`,
    '',
    '| Caso | Origem | Situação | Ferramenta | Detalhe |',
    '| --- | --- | --- | --- | --- |',
    ...resultados.map(
      (r) =>
        `| ${r.caso.id} | ${r.caso.origem} | ${r.situacao} | ${r.ferramenta ?? '—'} | ${(r.detalhe ?? '').replace(/\|/g, '/').slice(0, 120)} |`,
    ),
    '',
  ];
  // Como no gate da classificação: só casos reais contam para a meta de 98%; fictício só avisa.
  const doReal = resultados.filter((r) => r.caso.origem === 'real-anonimizado');
  const reaisSemGravacao = doReal.filter((r) => r.situacao === 'sem-gravacao').length;
  const acertoReal = reais === 0 ? 1 : doReal.filter((r) => r.situacao === 'acerto').length / reais;
  const avisos = [
    ...(reais === 0
      ? ['Só casos fictícios: o resultado exercita o fluxo e não conta para a meta de 98%.']
      : []),
    ...(semGravacao > 0
      ? [
          `${String(semGravacao)} caso(s) sem gravação: rode "pnpm --filter @pz/eval avaliar-ferramentas --gravar".`,
        ]
      : []),
  ];
  return {
    markdown: linhas.join('\n'),
    aprovado: reaisSemGravacao === 0 && acertoReal >= META_DE_ACERTO,
    ...(avisos.length === 0 ? {} : { aviso: avisos.join(' ') }),
  };
}
