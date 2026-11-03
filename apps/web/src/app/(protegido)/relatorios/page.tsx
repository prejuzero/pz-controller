import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';
import { dataNoFuso, somarDias, somarMeses } from '../calendario/grade';

import { TelaDeRelatorios } from './tela-de-relatorios';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('menu'))('relatorios') };
}

export default async function PaginaRelatorios() {
  await connection();
  // Mês corrente no fuso de Brasília, calculado no servidor (período padrão da agenda).
  const inicio = `${dataNoFuso(new Date()).slice(0, 7)}-01`;
  return (
    <SePermitido permissao="relatorios:exportar" alternativa={<AcessoNegado />}>
      <TelaDeRelatorios inicioDoMes={inicio} fimDoMes={somarDias(somarMeses(inicio, 1), -1)} />
    </SePermitido>
  );
}
