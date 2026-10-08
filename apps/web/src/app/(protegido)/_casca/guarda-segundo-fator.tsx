'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { useSessao } from '../../../api/hooks';
import { destinoAposEntrar, ROTA_ACEITAR_TERMOS } from '../../../rotas';

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
    const atual = busca === '' ? caminho : `${caminho}?${busca}`;
    if (passo === 'configurar-2fa' || passo === 'verificar-2fa')
      router.replace(destinoAposEntrar(passo, atual));
    // Versão nova de documento legal (HU38): a API bloqueia o uso até o aceite.
    if (passo === 'aceitar-termos')
      router.replace(
        `${ROTA_ACEITAR_TERMOS}?${new URLSearchParams({ retorno: atual }).toString()}`,
      );
  }, [passo, caminho, busca, router]);
  return null;
}
