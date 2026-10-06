'use client';

import { EstadoVazio } from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** Página 403 amigável (HU07): explica a falta de permissão e leva de volta ao início. */
export function AcessoNegado() {
  const t = useTranslations('erros');
  return (
    <EstadoVazio
      titulo={t('acessoNegado')}
      descricao={t('acessoNegadoDescricao')}
      acao={
        <Link href="/" className="text-primaria underline">
          {t('voltarInicio')}
        </Link>
      }
    />
  );
}
