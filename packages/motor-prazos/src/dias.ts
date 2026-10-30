import { DiaDaSemana, err, ok } from '@pz/kernel';

import type { CalendarioForense, Efeito, Ocorrencia } from './calendario.js';
import type { LocalDate, Result } from '@pz/kernel';

/** Dia que não entrou na contagem e por quê: vai para a memória de cálculo (CLAUDE.md, 4.4). */
export interface DiaDesconsiderado {
  readonly data: LocalDate;
  readonly motivo: string;
  /** Dispositivo ou ato que tira o dia da contagem. */
  readonly fundamento: string;
  /** Link oficial do ato do calendário, quando o dia vem dele. */
  readonly urlAto?: string;
}

/** Diz se o dia conta: lista vazia conta; senão, os motivos de não contar. */
export type CriterioDeContagem = (data: LocalDate) => readonly DiaDesconsiderado[];

/**
 * Teto de dias percorridos numa busca. Um calendário que suspende tudo (cadastro errado) não
 * pode travar o cálculo: o chamador recebe o erro e o prazo fica "a confirmar".
 */
export const LIMITE_DE_DIAS = 3660;

export interface CalendarioEsgotado {
  readonly tipo: 'calendario-esgotado';
  readonly aPartirDe: LocalDate;
}

export interface Avanco {
  readonly data: LocalDate;
  readonly desconsiderados: readonly DiaDesconsiderado[];
}

// CPC, art. 216: sábados e domingos são feriados para efeito forense.
const FIM_DE_SEMANA = 'CPC, art. 216';

function doCalendario(data: LocalDate, ocorrencia: Ocorrencia): DiaDesconsiderado {
  return {
    data,
    motivo: ocorrencia.motivo,
    // Dia sem expediente forense: CPC, art. 216; os demais efeitos valem pelo próprio ato.
    fundamento:
      ocorrencia.efeito === 'sem-expediente'
        ? `${FIM_DE_SEMANA}; ${ocorrencia.atoNormativo}`
        : ocorrencia.atoNormativo,
    urlAto: ocorrencia.urlAto,
  };
}

/**
 * Critério de dia útil: não conta sábado, domingo (CPC, art. 216) nem dia do calendário com os
 * efeitos informados. Quais efeitos tiram o dia da contagem é decisão da regra (RN01, RN02, RN07).
 */
export function semContarFimDeSemanaE(
  calendario: CalendarioForense,
  efeitos: readonly Efeito[],
): CriterioDeContagem {
  return (data) => {
    const motivos: DiaDesconsiderado[] = [];
    const semana = data.diaDaSemana();
    if (semana === DiaDaSemana.sabado || semana === DiaDaSemana.domingo) {
      motivos.push({
        data,
        motivo: semana === DiaDaSemana.sabado ? 'sábado' : 'domingo',
        fundamento: FIM_DE_SEMANA,
      });
    }
    for (const ocorrencia of calendario.ocorrencias(data)) {
      if (efeitos.includes(ocorrencia.efeito)) motivos.push(doCalendario(data, ocorrencia));
    }
    return motivos;
  };
}

/** Critério de dias corridos: só os efeitos informados tiram o dia da contagem. */
export function semContar(
  calendario: CalendarioForense,
  efeitos: readonly Efeito[],
): CriterioDeContagem {
  return (data) =>
    calendario
      .ocorrencias(data)
      .filter((ocorrencia) => efeitos.includes(ocorrencia.efeito))
      .map((ocorrencia) => doCalendario(data, ocorrencia));
}

/**
 * O n-ésimo dia que conta a partir de `inicio` (inclusive): `inicio` é o dia 1 se contar. Exclui
 * o dia do começo quem escolhe `inicio` (RN01, CPC, art. 224: o chamador passa o dia seguinte).
 */
export function contarDias(
  inicio: LocalDate,
  quantidade: number,
  conta: CriterioDeContagem,
): Result<Avanco, CalendarioEsgotado> {
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new RangeError(`Quantidade de dias deve ser inteira e positiva: ${String(quantidade)}`);
  }
  const desconsiderados: DiaDesconsiderado[] = [];
  let contados = 0;
  for (let passo = 0; passo < LIMITE_DE_DIAS; passo++) {
    const data = inicio.maisDias(passo);
    const motivos = conta(data);
    if (motivos.length > 0) {
      desconsiderados.push(...motivos);
    } else if (++contados === quantidade) {
      return ok({ data, desconsiderados });
    }
  }
  return err({ tipo: 'calendario-esgotado', aPartirDe: inicio });
}

/** Primeiro dia que conta estritamente depois de `data` (publicação, início, prorrogação). */
export function proximoDiaQueConta(
  data: LocalDate,
  conta: CriterioDeContagem,
): Result<Avanco, CalendarioEsgotado> {
  return contarDias(data.maisDias(1), 1, conta);
}

/** O próprio dia, se contar; senão, o próximo que conta (prorrogação: CPC, art. 224, §1º). */
export function esteOuProximoQueConta(
  data: LocalDate,
  conta: CriterioDeContagem,
): Result<Avanco, CalendarioEsgotado> {
  return contarDias(data, 1, conta);
}

/**
 * Dias úteis depois de `hoje` até `vencimento` (inclusive), para a tela mostrar a urgência (HU26).
 * É informação, não prazo: o vencimento já veio do motor. Não conta sábado, domingo (CPC,
 * art. 216), dia sem expediente nem suspensão de prazos; indisponibilidade só prorroga início ou
 * vencimento (CPC, art. 224, §1º; Lei 11.419/2006, art. 10, §2º) e por isso conta. Zero quando
 * vence hoje ou já venceu.
 */
export function diasUteisRestantes(
  hoje: LocalDate,
  vencimento: LocalDate,
  calendario: CalendarioForense,
): Result<number, CalendarioEsgotado> {
  const distancia = hoje.diasAte(vencimento);
  if (distancia <= 0) return ok(0);
  if (distancia > LIMITE_DE_DIAS) return err({ tipo: 'calendario-esgotado', aPartirDe: hoje });
  const conta = semContarFimDeSemanaE(calendario, ['sem-expediente', 'suspensao-de-prazos']);
  let uteis = 0;
  for (let passo = 1; passo <= distancia; passo++) {
    if (conta(hoje.maisDias(passo)).length === 0) uteis++;
  }
  return ok(uteis);
}
