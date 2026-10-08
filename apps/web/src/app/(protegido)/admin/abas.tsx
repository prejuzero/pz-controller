'use client';

import { cn } from '@pz/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { usePermissoes } from '../../../api/hooks';
import { filtrarPermitidos } from '../../../permissoes';

/** Abas da área do administrador; cada uma só aparece com a permissão que a API exige. */
const ABAS = [
  { chave: 'tenants', href: '/admin', permissao: 'admin:tenants' },
  { chave: 'integracoes', href: '/admin/integracoes', permissao: 'admin:filas' },
  { chave: 'rejeicoes', href: '/admin/rejeicoes', permissao: 'admin:tenants' },
  // Curadoria (HU13, HU15): telas próprias, para quem também é curador.
  { chave: 'calendario', href: '/calendario', permissao: 'curadoria:calendario' },
  { chave: 'tabelaPrazos', href: '/prazos', permissao: 'curadoria:tabela-prazos' },
] as const;

export function AbasAdmin() {
  const t = useTranslations('admin.abas');
  const caminho = usePathname();
  const abas = filtrarPermitidos(ABAS, usePermissoes() ?? []);
  return (
    <nav aria-label={t('rotulo')} className="flex flex-wrap gap-2 border-b border-borda pb-2">
      {abas.map((aba) => {
        const ativa = caminho === aba.href;
        return (
          <Link
            key={aba.chave}
            href={aba.href}
            aria-current={ativa ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center rounded-md px-3 text-sm outline-none hover:bg-primaria-suave focus-visible:ring-2 focus-visible:ring-foco',
              ativa ? 'bg-primaria-suave font-medium text-texto' : 'text-texto-suave',
            )}
          >
            {t(aba.chave)}
          </Link>
        );
      })}
    </nav>
  );
}
