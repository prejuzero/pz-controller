'use client';

import { cn } from '@pz/ui';
import {
  CalendarClock,
  CalendarDays,
  ChartColumn,
  FolderOpen,
  LayoutDashboard,
  Newspaper,
  Search,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import { hrefComFiltro } from '../../../filtro-global';

import type { ChaveMenu, ItemMenu } from '../../../navegacao';

export const ICONES: Record<ChaveMenu, LucideIcon> = {
  dashboard: LayoutDashboard,
  prazos: CalendarClock,
  publicacoes: Newspaper,
  busca: Search,
  processos: FolderOpen,
  calendario: CalendarDays,
  relatorios: ChartColumn,
  admin: ShieldCheck,
  configuracoes: Settings,
};

interface LinkMenuProps {
  item: ItemMenu;
  ativo: boolean;
  /** Só o ícone (sidebar recolhida e barra inferior compacta); o nome segue para leitores de tela. */
  compacto?: boolean;
  /** Ícone sobre o rótulo, como na barra inferior do celular. */
  vertical?: boolean;
  aoNavegar?: (() => void) | undefined;
}

/** O link leva o filtro global atual às telas que o aplicam (HU27). */
export function LinkMenu(props: LinkMenuProps) {
  // useSearchParams exige Suspense; sem ele, o link sai sem o filtro (renderização estática).
  return (
    <Suspense fallback={<LinkDoItem {...props} href={props.item.href} />}>
      <LinkComFiltro {...props} />
    </Suspense>
  );
}

function LinkComFiltro(props: LinkMenuProps) {
  return <LinkDoItem {...props} href={hrefComFiltro(props.item.href, useSearchParams())} />;
}

function LinkDoItem({
  item,
  href,
  ativo,
  compacto = false,
  vertical = false,
  aoNavegar,
}: LinkMenuProps & { href: string }) {
  const t = useTranslations('menu');
  const Icone = ICONES[item.chave];
  const nome = t(item.chave);
  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      title={compacto ? nome : undefined}
      {...(aoNavegar === undefined ? {} : { onClick: aoNavegar })}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-texto-suave outline-none hover:bg-primaria-suave hover:text-texto focus-visible:ring-2 focus-visible:ring-foco',
        vertical && 'flex-col justify-center gap-1 px-1 py-1.5 text-xs',
        compacto && 'justify-center px-0',
        ativo && 'bg-primaria-suave text-texto',
      )}
    >
      <Icone className="size-5 shrink-0" aria-hidden />
      <span className={cn(compacto && 'sr-only')}>{nome}</span>
    </Link>
  );
}
