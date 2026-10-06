'use client';

import { CircleUser, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';

import { useSair } from '../../../api/hooks';
import { ROTA_ENTRAR } from '../../../rotas';

const CLASSE_ITEM =
  'flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-3 text-sm outline-none data-[highlighted]:bg-primaria-suave';

export function Cabecalho() {
  const t = useTranslations('cabecalho');
  const sair = useSair();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-borda bg-superficie px-4">
      <span className="text-lg font-semibold md:hidden">{t('marca')}</span>
      {/* Busca rápida: o formulário só leva à tela de busca; a busca em si chega na HU28. */}
      <form action="/busca" role="search" className="hidden flex-1 sm:block">
        <label htmlFor="busca-rapida" className="sr-only">
          {t('buscaRapida')}
        </label>
        <input
          id="busca-rapida"
          name="q"
          type="search"
          placeholder={t('buscaRapida')}
          className="h-10 w-full max-w-md rounded-md border border-borda bg-fundo px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foco"
        />
      </form>
      <div className="ml-auto">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label={t('menuUsuario')}
            className="flex size-11 items-center justify-center rounded-full text-texto-suave outline-none hover:text-texto focus-visible:ring-2 focus-visible:ring-foco"
          >
            <CircleUser className="size-6" aria-hidden />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-56 rounded-md border border-borda bg-superficie-elevada p-1 text-texto shadow-lg"
            >
              <DropdownMenu.Label className="px-3 py-2 text-xs text-texto-suave">
                {t('minhaConta')}
              </DropdownMenu.Label>
              <DropdownMenu.Item asChild className={CLASSE_ITEM}>
                <Link href="/configuracoes">
                  <Settings className="size-4" aria-hidden />
                  {t('configuracoes')}
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-borda" />
              <DropdownMenu.Item
                className={CLASSE_ITEM}
                disabled={sair.isPending}
                onSelect={() => {
                  sair.mutate(undefined, {
                    onSuccess: () => {
                      window.location.assign(ROTA_ENTRAR);
                    },
                  });
                }}
              >
                <LogOut className="size-4" aria-hidden />
                {t('sair')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
