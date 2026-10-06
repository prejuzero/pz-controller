'use client';

import { cn } from '@pz/ui';
import { Ellipsis, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useState, type ReactNode } from 'react';

import { ITENS_BARRA_INFERIOR, ITENS_MENU, itemAtivo } from '../../../navegacao';

import { Cabecalho } from './cabecalho';
import { FaixaAvisos } from './faixa-avisos';
import { LinkMenu } from './link-menu';

/**
 * Casca autenticada (HU23): sidebar recolhível no desktop; no celular, barra inferior com os itens
 * de uso diário e gaveta "Mais" com o menu completo. Utilizável a partir de 360 px.
 */
export function Casca({ children }: { children: ReactNode }) {
  const t = useTranslations('menu');
  const caminho = usePathname();
  const [recolhida, setRecolhida] = useState(false);

  return (
    <div className="flex min-h-dvh bg-fundo text-texto">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-superficie-elevada p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('pularParaConteudo')}
      </a>

      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col gap-2 border-r border-borda bg-superficie p-2 md:flex',
          recolhida ? 'w-16' : 'w-60',
        )}
      >
        <div
          className={cn(
            'flex h-12 items-center',
            recolhida ? 'justify-center' : 'justify-between pl-3',
          )}
        >
          {recolhida ? null : <span className="text-lg font-semibold">{t('marca')}</span>}
          <button
            type="button"
            aria-expanded={!recolhida}
            aria-controls="menu-lateral"
            aria-label={recolhida ? t('expandir') : t('recolher')}
            title={recolhida ? t('expandir') : t('recolher')}
            onClick={() => {
              setRecolhida((atual) => !atual);
            }}
            className="flex size-11 items-center justify-center rounded-md text-texto-suave outline-none hover:bg-primaria-suave hover:text-texto focus-visible:ring-2 focus-visible:ring-foco"
          >
            {recolhida ? (
              <PanelLeftOpen className="size-5" aria-hidden />
            ) : (
              <PanelLeftClose className="size-5" aria-hidden />
            )}
          </button>
        </div>
        <nav id="menu-lateral" aria-label={t('principal')}>
          <ul className="grid gap-1">
            {ITENS_MENU.map((item) => (
              <li key={item.chave}>
                <LinkMenu item={item} ativo={itemAtivo(caminho, item.href)} compacto={recolhida} />
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Cabecalho />
        <FaixaAvisos />
        <main id="conteudo" tabIndex={-1} className="flex-1 p-4 pb-24 outline-none md:p-6">
          {children}
        </main>
      </div>

      <NavegacaoInferior caminho={caminho} />
    </div>
  );
}

function NavegacaoInferior({ caminho }: { caminho: string }) {
  const t = useTranslations('menu');
  const [aberta, setAberta] = useState(false);
  const fechar = () => {
    setAberta(false);
  };

  return (
    <nav
      aria-label={t('principal')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-borda bg-superficie pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {ITENS_BARRA_INFERIOR.map((item) => (
          <li key={item.chave}>
            <LinkMenu item={item} ativo={itemAtivo(caminho, item.href)} vertical />
          </li>
        ))}
        <li>
          <Dialog.Root open={aberta} onOpenChange={setAberta}>
            <Dialog.Trigger className="flex min-h-11 w-full flex-col items-center justify-center gap-1 px-1 py-1.5 text-xs font-medium text-texto-suave outline-none focus-visible:ring-2 focus-visible:ring-foco">
              <Ellipsis className="size-5" aria-hidden />
              {t('mais')}
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
              <Dialog.Content
                aria-describedby={undefined}
                className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-lg border-t border-borda bg-superficie-elevada p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-texto"
              >
                <div className="mb-2 flex items-center justify-between">
                  <Dialog.Title className="text-lg font-semibold">{t('principal')}</Dialog.Title>
                  <Dialog.Close
                    aria-label={t('fechar')}
                    className="flex size-11 items-center justify-center rounded-md text-texto-suave outline-none focus-visible:ring-2 focus-visible:ring-foco"
                  >
                    <X className="size-5" aria-hidden />
                  </Dialog.Close>
                </div>
                <ul className="grid gap-1">
                  {ITENS_MENU.map((item) => (
                    <li key={item.chave}>
                      <LinkMenu
                        item={item}
                        ativo={itemAtivo(caminho, item.href)}
                        aoNavegar={fechar}
                      />
                    </li>
                  ))}
                </ul>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </li>
      </ul>
    </nav>
  );
}
