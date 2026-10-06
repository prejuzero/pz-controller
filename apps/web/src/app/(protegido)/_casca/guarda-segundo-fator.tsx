'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { useSessao } from '../../../api/hooks';
import { destinoAposEntrar } from '../../../rotas';

/**
 * Sessão só com a senha (2FA pendente) não usa o portal: vai para /entrar/2fa e volta depois.
 * É só conveniência; a API recusa as rotas protegidas enquanto o 2FA faltar (HU06).
 */
export function GuardaSegundoFator() {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams().toString();
  const passo = useSessao().data?.proximoPasso;
  useEffect(() => {
    if (passo === 'configurar-2fa' || passo === 'verificar-2fa')
      router.replace(destinoAposEntrar(passo, busca === '' ? caminho : `${caminho}?${busca}`));
  }, [passo, caminho, busca, router]);
  return null;
}
