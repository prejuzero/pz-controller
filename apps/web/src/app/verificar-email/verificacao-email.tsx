'use client';

import { EstadoCarregando } from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useVerificarEmail } from '../../api/hooks';
import { tokenDoFragmento } from '../../rotas';

/** Link do e-mail de boas-vindas (HU11): confirma o e-mail assim que a página abre. */
export function VerificacaoEmail() {
  const t = useTranslations('verificarEmail');
  const verificar = useVerificarEmail();
  const [token] = useState(() => tokenDoFragmento(window.location.hash) ?? null);
  const { mutate } = verificar;
  useEffect(() => {
    // Tira o token da barra de endereços e do histórico.
    window.history.replaceState(null, '', window.location.pathname);
    if (token !== null) mutate(token);
  }, [token, mutate]);

  if (token === null || verificar.isError)
    return (
      <p role="alert" className="text-sm">
        {t('invalido')}
      </p>
    );
  if (!verificar.isSuccess) return <EstadoCarregando rotulo={t('verificando')} />;
  return (
    <div role="status" className="grid gap-4 text-sm">
      <p>{t('confirmado')}</p>
      <Link href="/" className="underline underline-offset-4">
        {t('irParaPortal')}
      </Link>
    </div>
  );
}
