import { custoEstimadoUsd, type ConfiguracaoDasTarefas } from '@pz/ia';

import { atoPrevisto, type ResultadoDoCaso } from './avaliar.js';

/** Meta de acerto na classificação de atos (CLAUDE.md, seção 11). */
export const META_DE_ACERTO = 0.98;

export interface MetricasDoTipo {
  readonly tipo: string;
  /** Casos anotados com este tipo. */
  readonly anotados: number;
  /** Casos em que o sistema disse este tipo. */
  readonly previstos: number;
  readonly acertos: number;
}

export interface Metricas {
  readonly casos: number;
  readonly acertos: number;
  /** null quando não há casos. */
  readonly acuracia: number | null;
  readonly semGravacao: number;
  readonly prazoCitadoCorreto: number;
  readonly porTipo: readonly MetricasDoTipo[];
  /** anotado → previsto → quantidade. */
  readonly confusao: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly porOrigem: Readonly<Record<string, number>>;
  readonly porSituacao: Readonly<Record<string, number>>;
  readonly chamadasIa: number;
  readonly custoUsd: number;
  readonly latenciaMediaMs: number | null;
  readonly latenciaP95Ms: number | null;
}

const contar = (mapa: Record<string, number>, chave: string) => {
  mapa[chave] = (mapa[chave] ?? 0) + 1;
};

const percentil = (valores: readonly number[], p: number): number | null => {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil(p * ordenados.length) - 1)] ?? null;
};

const prazoCorreto = (r: ResultadoDoCaso): boolean => {
  if (r.classificacao === undefined) return false;
  const anotado = r.caso.anotacao.prazoCitado;
  const extraido = r.classificacao.prazoCitado;
  if (anotado === null || extraido === null) return anotado === extraido;
  return anotado.quantidade === extraido.quantidade && anotado.unidade === extraido.unidade;
};

export function calcularMetricas(
  resultados: readonly ResultadoDoCaso[],
  configuracao: ConfiguracaoDasTarefas,
): Metricas {
  const confusao: Record<string, Record<string, number>> = {};
  const porOrigem: Record<string, number> = {};
  const porSituacao: Record<string, number> = {};
  const tipos = new Map<string, { anotados: number; previstos: number; acertos: number }>();
  const doTipo = (tipo: string) => {
    const atual = tipos.get(tipo) ?? { anotados: 0, previstos: 0, acertos: 0 };
    tipos.set(tipo, atual);
    return atual;
  };
  let acertos = 0;
  let prazoCitadoCorreto = 0;
  const latencias: number[] = [];
  let custoUsd = 0;
  for (const r of resultados) {
    const anotado = r.caso.anotacao.tipoAto;
    const previsto = r.semGravacao ? 'sem-gravacao' : atoPrevisto(r);
    contar((confusao[anotado] ??= {}), previsto);
    doTipo(anotado).anotados += 1;
    doTipo(previsto).previstos += 1;
    if (anotado === previsto) {
      acertos += 1;
      doTipo(anotado).acertos += 1;
    }
    if (prazoCorreto(r)) prazoCitadoCorreto += 1;
    contar(porOrigem, r.classificacao?.origem ?? 'sem-gravacao');
    contar(porSituacao, r.classificacao?.situacao ?? 'sem-gravacao');
    for (const chamada of r.chamadas) {
      latencias.push(chamada.latenciaMs);
      const preco = configuracao.precos[chamada.modelo];
      if (chamada.resultado.tipo === 'ok' && preco !== undefined) {
        custoUsd += custoEstimadoUsd(preco, chamada.resultado.uso);
      }
    }
  }
  return {
    casos: resultados.length,
    acertos,
    acuracia: resultados.length === 0 ? null : acertos / resultados.length,
    semGravacao: resultados.filter((r) => r.semGravacao).length,
    prazoCitadoCorreto,
    porTipo: [...tipos.entries()]
      .map(([tipo, m]) => ({ tipo, ...m }))
      .sort((a, b) => a.tipo.localeCompare(b.tipo)),
    confusao,
    porOrigem,
    porSituacao,
    chamadasIa: latencias.length,
    custoUsd,
    latenciaMediaMs:
      latencias.length === 0 ? null : latencias.reduce((a, b) => a + b, 0) / latencias.length,
    latenciaP95Ms: percentil(latencias, 0.95),
  };
}

/** Só os casos reais com anotação revisada entram na meta; os fictícios só testam o fluxo. */
export const contaParaAMeta = (r: ResultadoDoCaso): boolean =>
  r.caso.origem === 'real-anonimizado' && r.caso.revisor !== null;

export type Veredito =
  | { readonly aprovado: true; readonly aviso?: string }
  | { readonly aprovado: false; readonly motivo: string };

/**
 * Gate do CI: bloqueia abaixo da meta ou quando falta gravação para um caso da meta (a
 * configuração mudou e ninguém mediu). Sem casos reais o gate passa com aviso explícito, para não
 * travar o repositório enquanto o conjunto é montado.
 */
export function veredito(meta: Metricas, referenciaProvisoria: boolean): Veredito {
  if (meta.casos === 0) {
    return {
      aprovado: true,
      aviso: 'Meta não medida: nenhum caso real anonimizado e revisado no conjunto.',
    };
  }
  if (meta.semGravacao > 0) {
    return {
      aprovado: false,
      motivo: `${String(meta.semGravacao)} caso(s) da meta sem resposta gravada para a configuração atual: rode "pnpm eval --gravar" com a chave e versione as gravações.`,
    };
  }
  const acuracia = meta.acuracia ?? 0;
  if (acuracia < META_DE_ACERTO) {
    return {
      aprovado: false,
      motivo: `Acerto de ${porcento(acuracia)} abaixo da meta de ${porcento(META_DE_ACERTO)}.`,
    };
  }
  return referenciaProvisoria
    ? { aprovado: true, aviso: 'Taxonomia ou regras provisórias: o resultado não vale como meta.' }
    : { aprovado: true };
}

const porcento = (valor: number) => `${(valor * 100).toFixed(1).replace('.', ',')}%`;
const ms = (valor: number | null) => (valor === null ? '—' : `${String(Math.round(valor))} ms`);

function secao(titulo: string, m: Metricas): string[] {
  const linhas = [
    `## ${titulo}`,
    '',
    `- Casos: ${String(m.casos)} · acertos: ${String(m.acertos)} · acurácia: ${m.acuracia === null ? '—' : porcento(m.acuracia)}`,
    `- Prazo citado correto: ${String(m.prazoCitadoCorreto)}/${String(m.casos)} · sem gravação: ${String(m.semGravacao)}`,
    `- Origem: ${JSON.stringify(m.porOrigem)} · situação: ${JSON.stringify(m.porSituacao)}`,
    `- Chamadas à IA: ${String(m.chamadasIa)} · custo estimado: US$ ${m.custoUsd.toFixed(4)} · latência média ${ms(m.latenciaMediaMs)}, p95 ${ms(m.latenciaP95Ms)}`,
    '',
  ];
  if (m.casos === 0) return linhas;
  linhas.push('| Tipo | Anotados | Previstos | Acertos |', '| --- | --: | --: | --: |');
  for (const t of m.porTipo) {
    linhas.push(
      `| ${t.tipo} | ${String(t.anotados)} | ${String(t.previstos)} | ${String(t.acertos)} |`,
    );
  }
  linhas.push('', '**Matriz de confusão** (anotado → previsto)', '');
  for (const [anotado, previstos] of Object.entries(m.confusao).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const lista = Object.entries(previstos)
      .map(([p, n]) => `${p} (${String(n)})`)
      .join(', ');
    linhas.push(`- ${anotado} → ${lista}`);
  }
  linhas.push('');
  return linhas;
}

export interface Relatorio {
  readonly versaoDoPrompt: string;
  readonly versaoDaConfiguracao: string;
  readonly versaoDaTaxonomia: string;
  readonly versaoDasRegras: string;
  readonly veredito: Veredito;
  readonly meta: Metricas;
  readonly todos: Metricas;
  readonly erros: readonly {
    readonly caso: string;
    readonly anotado: string;
    readonly previsto: string;
  }[];
}

export function montarRelatorio(
  resultados: readonly ResultadoDoCaso[],
  configuracao: ConfiguracaoDasTarefas,
  versoes: Pick<
    Relatorio,
    'versaoDoPrompt' | 'versaoDaConfiguracao' | 'versaoDaTaxonomia' | 'versaoDasRegras'
  >,
  referenciaProvisoria: boolean,
): Relatorio {
  const meta = calcularMetricas(resultados.filter(contaParaAMeta), configuracao);
  return {
    ...versoes,
    veredito: veredito(meta, referenciaProvisoria),
    meta,
    todos: calcularMetricas(resultados, configuracao),
    // Só ids e códigos: o teor não sai no relatório (artefato do CI).
    erros: resultados
      .map((r) => ({
        caso: r.caso.id,
        anotado: r.caso.anotacao.tipoAto,
        previsto: r.semGravacao ? 'sem-gravacao' : atoPrevisto(r),
      }))
      .filter((e) => e.anotado !== e.previsto),
  };
}

export function relatorioEmMarkdown(r: Relatorio): string {
  const v = r.veredito;
  const resultado = v.aprovado
    ? `**Aprovado**${v.aviso === undefined ? '' : ` (aviso: ${v.aviso})`}`
    : `**Reprovado**: ${v.motivo}`;
  return [
    '# Avaliação da classificação de atos (HU22)',
    '',
    `Prompt \`${r.versaoDoPrompt}\` · configuração \`${r.versaoDaConfiguracao}\` · taxonomia \`${r.versaoDaTaxonomia}\` · regras \`${r.versaoDasRegras}\``,
    '',
    `Resultado: ${resultado}`,
    '',
    ...secao('Meta (casos reais revisados)', r.meta),
    ...secao('Todos os casos (inclui fictícios)', r.todos),
    '## Erros',
    '',
    ...(r.erros.length === 0
      ? ['Nenhum.']
      : r.erros.map((e) => `- ${e.caso}: anotado ${e.anotado}, previsto ${e.previsto}`)),
    '',
  ].join('\n');
}
