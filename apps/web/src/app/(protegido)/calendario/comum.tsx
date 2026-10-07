'use client';

import { Selecao } from '@pz/ui';
import { useTranslations } from 'next-intl';

import { formatarDataCivil } from '../../../i18n/formatar';

import type { FeriadoLocal } from '@pz/contracts';

type Evento = Pick<
  FeriadoLocal,
  'abrangencia' | 'uf' | 'municipioIbge' | 'tribunal' | 'comarca' | 'inicio' | 'fim'
>;

/** Onde o evento vale, no formato curto da tabela (ex.: "SP · 3550308", "TJSP · Campinas"). */
export function descreverLocal(evento: Evento): string {
  const partes = [evento.uf, evento.municipioIbge, evento.tribunal, evento.comarca].filter(
    (parte): parte is string => parte !== null && parte !== '',
  );
  return partes.length === 0 ? '—' : partes.join(' · ');
}

export function descreverPeriodo(evento: Evento): string {
  const inicio = formatarDataCivil(evento.inicio);
  return evento.inicio === evento.fim ? inicio : `${inicio} – ${formatarDataCivil(evento.fim)}`;
}

/** Ano de referência das listas: o atual, os dois anteriores e os dois seguintes. */
export function SeletorAno({
  ano,
  anoAtual,
  aoMudar,
}: {
  ano: number;
  anoAtual: number;
  aoMudar: (ano: number) => void;
}) {
  const t = useTranslations('calendario');
  const anos = [-2, -1, 0, 1, 2].map((desvio) => String(anoAtual + desvio));
  return (
    <Selecao
      rotulo={t('ano')}
      className="w-32"
      opcoes={anos.map((valor) => ({ valor, rotulo: valor }))}
      valor={String(ano)}
      aoMudar={(valor) => {
        aoMudar(Number(valor));
      }}
    />
  );
}
