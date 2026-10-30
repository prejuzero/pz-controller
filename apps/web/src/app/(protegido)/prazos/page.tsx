import { getTranslations } from 'next-intl/server';

import { RECORTES_DA_LISTA, STATUS_DO_PRAZO } from '../../../api/prazos';
import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';

import { ListaDePrazos } from './lista-de-prazos';
import { TabelaDePrazos } from './tabela-de-prazos';

import type { RecorteDaLista, StatusDoPrazo } from '../../../api/prazos';
import type { Metadata } from 'next';

/** Só aceita da URL os valores conhecidos; o resto é ignorado (lista padrão). */
const conhecido = <T extends string>(lista: readonly T[], valor: unknown): T | undefined =>
  lista.find((item) => item === valor);

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('menu'))('prazos') };
}

export default async function PaginaPrazos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const busca = await searchParams;
  const recorte: RecorteDaLista | undefined = conhecido(RECORTES_DA_LISTA, busca.recorte);
  const status: StatusDoPrazo | undefined = conhecido(STATUS_DO_PRAZO, busca.status);
  // Escritório: a lista de prazos (HU24). Curadoria: a tabela de prazos por ato (HU15).
  const escritorio = (
    <SePermitido permissao="prazos:ler" alternativa={<AcessoNegado />}>
      <ListaDePrazos recorte={recorte} status={status} />
    </SePermitido>
  );
  return (
    <SePermitido permissao="curadoria:tabela-prazos" alternativa={escritorio}>
      <TabelaDePrazos />
    </SePermitido>
  );
}
