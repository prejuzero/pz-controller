'use client';

import { Botao, Campo, SeletorData, Selecao } from '@pz/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useClientes, useSessao } from '../../../api/hooks';
import {
  CAMPOS_DO_FILTRO_GLOBAL,
  comFiltroGlobal,
  lerFiltroGlobal,
  type CampoDoFiltroGlobal,
  type FiltroGlobal,
} from '../../../filtro-global';

/** Filtro global da URL (HU27): o mesmo em dashboard, calendário e listas. */
export function useFiltroGlobal(): FiltroGlobal {
  return lerFiltroGlobal(useSearchParams());
}

const ROTULOS = {
  de: 'de',
  ate: 'ate',
  responsavelId: 'advogado',
  tribunal: 'tribunal',
  clienteId: 'cliente',
} as const satisfies Record<CampoDoFiltroGlobal, string>;

interface Props {
  /** Campos que a tela aplica; os outros seguem na URL para as próximas telas. */
  aplicados: readonly CampoDoFiltroGlobal[];
}

/**
 * Barra do filtro global (HU27, RF43). O estado vive na URL: recarregar, voltar e compartilhar
 * o link mantêm o filtro. Advogado: todos ou só os do usuário (a lista da equipe é pendência).
 */
export function BarraDeFiltroGlobal({ aplicados }: Props) {
  const t = useTranslations('filtroGlobal');
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const filtro = lerFiltroGlobal(busca);
  const usuarioId = useSessao().data?.usuarioId;
  const clientes = useClientes();

  const mudar = (parcial: FiltroGlobal) => {
    const query = comFiltroGlobal(busca, { ...filtro, ...parcial }).toString();
    router.replace(query === '' ? caminho : `${caminho}?${query}`, { scroll: false });
  };
  const usa = (campo: CampoDoFiltroGlobal) => aplicados.includes(campo);
  const ignorados = CAMPOS_DO_FILTRO_GLOBAL.filter((c) => filtro[c] !== undefined && !usa(c));
  const ativo = CAMPOS_DO_FILTRO_GLOBAL.some((c) => filtro[c] !== undefined);

  return (
    <section
      aria-label={t('titulo')}
      className="space-y-2 rounded-lg border border-borda p-4"
      data-testid="filtro-global"
    >
      <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {usa('de') ? (
          <SeletorData
            rotulo={t('de')}
            valor={filtro.de}
            aoMudar={(de) => {
              mudar({ de: de ?? '' });
            }}
          />
        ) : null}
        {usa('ate') ? (
          <SeletorData
            rotulo={t('ate')}
            valor={filtro.ate}
            aoMudar={(ate) => {
              mudar({ ate: ate ?? '' });
            }}
          />
        ) : null}
        {usa('responsavelId') ? (
          <Selecao
            rotulo={t('advogado')}
            valor={filtro.responsavelId ?? ''}
            opcoes={[
              { valor: '', rotulo: t('todos') },
              ...(usuarioId === undefined ? [] : [{ valor: usuarioId, rotulo: t('meus') }]),
            ]}
            aoMudar={(responsavelId) => {
              mudar({ responsavelId });
            }}
          />
        ) : null}
        {usa('tribunal') ? (
          // Sem estado próprio: a chave recria o campo quando a URL muda (voltar, limpar).
          <Campo
            key={filtro.tribunal ?? ''}
            rotulo={t('tribunal')}
            placeholder={t('tribunalMarcador')}
            defaultValue={filtro.tribunal ?? ''}
            maxLength={20}
            className="uppercase"
            onBlur={(evento) => {
              mudar({ tribunal: evento.target.value.toUpperCase() });
            }}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter')
                mudar({ tribunal: evento.currentTarget.value.toUpperCase() });
            }}
          />
        ) : null}
        {usa('clienteId') ? (
          <Selecao
            rotulo={t('cliente')}
            valor={filtro.clienteId ?? ''}
            opcoes={[
              { valor: '', rotulo: t('todos') },
              ...(clientes.data?.itens ?? []).map((c) => ({ valor: c.id, rotulo: c.nome })),
            ]}
            aoMudar={(clienteId) => {
              mudar({ clienteId });
            }}
          />
        ) : null}
        {ativo ? (
          <Botao
            variante="secundaria"
            onClick={() => {
              mudar(Object.fromEntries(CAMPOS_DO_FILTRO_GLOBAL.map((c) => [c, ''])));
            }}
          >
            {t('limpar')}
          </Botao>
        ) : null}
      </div>
      {ignorados.length > 0 ? (
        <p className="text-sm text-texto-suave">
          {t('naoAplicado', { campos: ignorados.map((c) => t(ROTULOS[c])).join(', ') })}
        </p>
      ) : null}
    </section>
  );
}
