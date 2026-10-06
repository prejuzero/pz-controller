import type { ConteudoDoEvento, OrigemDoEvento, TipoDeEvento } from './evento.js';
import type { LocalDate, Uuid } from '@pz/kernel';

/**
 * Onde o ato deve ser praticado. Vem do processo; campo ausente significa que eventos daquele
 * nível não se aplicam. O tenant não entra aqui: vem do contexto da transação (RLS).
 */
export interface Jurisdicao {
  readonly uf?: string;
  readonly municipioIbge?: string;
  readonly tribunal?: string;
  readonly comarca?: string;
}

/** Evento vigente (global aprovado e não revogado, ou local não revogado). */
export interface EventoVigente {
  readonly id: Uuid;
  readonly origem: OrigemDoEvento;
  readonly conteudo: ConteudoDoEvento;
}

/** Um dia sem contagem e por quê: entra na memória de cálculo (CLAUDE.md, seção 4.4). */
export interface DiaNaoUtil {
  readonly data: LocalDate;
  readonly tipo: TipoDeEvento;
  readonly motivo: string;
  readonly fonte: {
    readonly origem: OrigemDoEvento;
    readonly eventoId: Uuid;
    readonly atoNormativo: string;
    readonly urlAto: string;
  };
}

/** O evento alcança a jurisdição? Comarca só existe dentro do seu tribunal. */
export function alcanca(conteudo: ConteudoDoEvento, jurisdicao: Jurisdicao): boolean {
  switch (conteudo.abrangencia) {
    case 'nacional':
      return true;
    case 'uf':
      return jurisdicao.uf !== undefined && jurisdicao.uf === conteudo.uf;
    case 'municipio':
      return (
        jurisdicao.municipioIbge !== undefined &&
        jurisdicao.uf === conteudo.uf &&
        jurisdicao.municipioIbge === conteudo.municipioIbge
      );
    case 'tribunal':
      return jurisdicao.tribunal !== undefined && jurisdicao.tribunal === conteudo.tribunal;
    case 'comarca':
      return (
        jurisdicao.comarca !== undefined &&
        jurisdicao.tribunal === conteudo.tribunal &&
        jurisdicao.comarca === conteudo.comarca
      );
  }
}

/**
 * Dias do período (inclusivo) sem contagem na jurisdição, um item por dia e evento, em ordem de
 * data (no mesmo dia, globais antes dos locais). Só eventos cadastrados: sábados e domingos são
 * regra do motor (CPC, art. 216), que decide também o efeito de cada tipo (ADR-007).
 */
export function diasNaoUteis(
  eventos: readonly EventoVigente[],
  jurisdicao: Jurisdicao,
  inicio: LocalDate,
  fim: LocalDate,
): DiaNaoUtil[] {
  const dias: DiaNaoUtil[] = [];
  for (const { id, origem, conteudo } of eventos) {
    if (!alcanca(conteudo, jurisdicao)) continue;
    let data = conteudo.inicio.ehAntesDe(inicio) ? inicio : conteudo.inicio;
    const ultimo = conteudo.fim.ehDepoisDe(fim) ? fim : conteudo.fim;
    while (!data.ehDepoisDe(ultimo)) {
      dias.push({
        data,
        tipo: conteudo.tipo,
        motivo: conteudo.descricao,
        fonte: {
          origem,
          eventoId: id,
          atoNormativo: conteudo.atoNormativo,
          urlAto: conteudo.urlAto,
        },
      });
      data = data.maisDias(1);
    }
  }
  return dias.sort(
    (a, b) =>
      a.data.comparar(b.data) ||
      a.fonte.origem.localeCompare(b.fonte.origem) ||
      a.fonte.eventoId.localeCompare(b.fonte.eventoId),
  );
}
