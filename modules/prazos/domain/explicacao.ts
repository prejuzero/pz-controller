import { LocalDate } from '@pz/kernel';

/**
 * Explicação do cálculo em linguagem simples (HU62; decisão do usuário em 06/11/2026: texto
 * determinístico, sem IA). Só reescreve o que o motor gravou na memória (CLAUDE.md, seção 4.4):
 * nenhuma data é calculada, ajustada ou deduzida aqui. Memória ausente ou malformada não gera
 * explicação, em vez de inventar.
 */
export interface EntradaDaExplicacao {
  readonly dias: number | null;
  readonly unidade: string | null;
  readonly status: string;
  /** A memória como gravada no prazo (JSON do motor, datas em ISO). */
  readonly memoria: unknown;
}

interface DiaDesconsiderado {
  readonly data: string;
  readonly motivo: string;
}

interface Alternativa {
  readonly vencimento: string;
  readonly descricao: string;
}

const UNIDADES: Readonly<Record<string, readonly [string, string]>> = {
  dias: ['dia', 'dias'],
  horas: ['hora', 'horas'],
  meses: ['mês', 'meses'],
  anos: ['ano', 'anos'],
};

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Data ISO da memória em DD/MM/AAAA; `undefined` se não for uma data válida. */
function data(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const lida = LocalDate.analisar(valor);
  if (!lida.ok) return undefined;
  const d = lida.valor;
  return `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}/${String(d.ano)}`;
}

const textos = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];

function lista(itens: readonly string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens.at(-1) ?? ''}`;
}

function aConfirmar(memoria: Record<string, unknown>): string[] {
  const detalhe = typeof memoria.detalhe === 'string' ? memoria.detalhe : 'faltou um dado';
  return [
    `O sistema não calculou este prazo: ${detalhe}.`,
    'Informe a data no ajuste; ela fica marcada como definida manualmente.',
  ];
}

export function explicarCalculo(entrada: EntradaDaExplicacao): string[] {
  const { memoria } = entrada;
  if (!objeto(memoria)) return [];
  if (memoria.situacao === 'a-confirmar') return aConfirmar(memoria);
  if (memoria.situacao === 'definido-manualmente') {
    const informada = data(memoria.vencimento);
    if (informada === undefined) return [];
    return [
      `A data ${informada} foi definida manualmente pelo advogado, sem cálculo do sistema.`,
      ...(typeof memoria.motivo === 'string' ? [`Motivo informado: ${memoria.motivo}`] : []),
    ];
  }
  const inicio = data(memoria.inicio);
  const vencimento = data(memoria.vencimento);
  if (memoria.situacao !== 'calculado' || inicio === undefined || vencimento === undefined) {
    return [];
  }
  const linhas: string[] = [];

  const fundamentos = textos(memoria.fundamentos);
  const unidade = entrada.unidade === null ? undefined : UNIDADES[entrada.unidade];
  if (entrada.dias !== null && unidade !== undefined) {
    const singular = entrada.dias === 1;
    const quanto = `${String(entrada.dias)} ${singular ? unidade[0] : unidade[1]}`;
    linhas.push(
      fundamentos.length === 0
        ? `O prazo é de ${quanto}.`
        : `O prazo é de ${quanto}, ${singular ? 'contado' : 'contados'} conforme ${fundamentos.join('; ')}.`,
    );
  }

  const publicacao = data(memoria.publicacao);
  const ciencia = data(memoria.ciencia);
  if (publicacao !== undefined) {
    linhas.push(
      `A intimação foi considerada publicada em ${publicacao}, e a contagem começou em ${inicio}.`,
    );
  } else if (ciencia !== undefined) {
    linhas.push(`A ciência foi em ${ciencia}, e a contagem começou em ${inicio}.`);
  } else {
    linhas.push(`A contagem começou em ${inicio}.`);
  }

  const desconsiderados = (
    Array.isArray(memoria.diasDesconsiderados) ? memoria.diasDesconsiderados : []
  ).flatMap((d: unknown): DiaDesconsiderado[] => {
    if (!objeto(d) || typeof d.motivo !== 'string') return [];
    const quando = data(d.data);
    return quando === undefined ? [] : [{ data: quando, motivo: d.motivo }];
  });
  if (desconsiderados.length === 0) {
    linhas.push('Nenhum dia foi desconsiderado.');
  } else {
    const n = desconsiderados.length;
    linhas.push(
      `${n === 1 ? 'Não contou' : 'Não contaram'} ${String(n)} ${n === 1 ? 'dia' : 'dias'} sem expediente: ${lista(desconsiderados.map((d) => `${d.data} (${d.motivo})`))}.`,
    );
  }

  const fuso = typeof memoria.fusoDoJuizo === 'string' ? memoria.fusoDoJuizo : 'do juízo';
  linhas.push(`O prazo vence em ${vencimento}, até as 24h no horário do juízo (${fuso}).`);

  const alternativas = (Array.isArray(memoria.alternativas) ? memoria.alternativas : []).flatMap(
    (a: unknown): Alternativa[] => {
      if (!objeto(a) || typeof a.descricao !== 'string') return [];
      const quando = data(a.vencimento);
      return quando === undefined ? [] : [{ vencimento: quando, descricao: a.descricao }];
    },
  );
  if (alternativas.length > 0) {
    linhas.push(
      `Há outras leituras possíveis: ${lista(alternativas.map((a) => `${a.vencimento} (${a.descricao})`))}. O sistema sugere sempre a data mais cedo; a decisão é sua.`,
    );
  }
  for (const aviso of textos(memoria.avisos)) linhas.push(`Atenção: ${aviso}`);
  // O sistema sugere, o advogado decide (CLAUDE.md, seção 2).
  if (entrada.status === 'a-confirmar') {
    linhas.push('Esta data é uma sugestão: ela só vale depois que você a confirmar.');
  }
  return linhas;
}
