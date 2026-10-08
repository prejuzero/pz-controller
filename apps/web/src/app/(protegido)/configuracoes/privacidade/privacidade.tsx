'use client';

import {
  avisar,
  Botao,
  Dialogo,
  EstadoCarregando,
  EstadoVazio,
  FecharDialogo,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import {
  useAceites,
  useCancelarEncerramento,
  useEncerramento,
  useEncerrarConta,
  useExportacao,
  useExportarDados,
} from '../../../../api/hooks';
import { formatarInstante } from '../../../../i18n/formatar';
import { SePermitido } from '../../_casca/se-permitido';

import type { AceitesDoUsuario } from '@pz/contracts';

type Aceite = AceitesDoUsuario['itens'][number];

/** Configurações > Privacidade (HU38, LGPD): aceites, exportação e encerramento da conta. */
export function Privacidade() {
  const t = useTranslations('privacidade');
  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
      <Secao titulo={t('aceitesTitulo')}>
        <Aceites />
      </Secao>
      <Secao titulo={t('exportarTitulo')} descricao={t('exportarDescricao')}>
        <Exportacao escopo="titular" />
      </Secao>
      <SePermitido permissao="escritorio:exportar">
        <Secao titulo={t('exportarEscritorioTitulo')} descricao={t('exportarEscritorioDescricao')}>
          <Exportacao escopo="escritorio" />
        </Secao>
      </SePermitido>
      <SePermitido permissao="escritorio:encerrar">
        <Secao titulo={t('encerrarTitulo')} descricao={t('encerrarDescricao')}>
          <Encerramento />
        </Secao>
      </SePermitido>
    </div>
  );
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {descricao === undefined ? null : <p className="text-sm text-texto-suave">{descricao}</p>}
      {children}
    </section>
  );
}

function Aceites() {
  const t = useTranslations('privacidade');
  const tl = useTranslations('legal');
  const aceites = useAceites();
  if (aceites.data === undefined) return <EstadoCarregando />;
  const colunas: ColunaTabela<Aceite>[] = [
    {
      id: 'documento',
      header: t('colunas.documento'),
      cell: ({ row }) => (
        <Link href={`/${row.original.tipo}`} className="underline underline-offset-4">
          {tl(row.original.tipo)}
        </Link>
      ),
    },
    { accessorKey: 'versao', header: t('colunas.versao') },
    {
      id: 'aceitoEm',
      header: t('colunas.aceitoEm'),
      cell: ({ row }) => formatarInstante(row.original.aceitoEm),
    },
    { accessorKey: 'ip', header: t('colunas.origem') },
  ];
  return (
    <TabelaDados
      titulo={t('aceitesTitulo')}
      colunas={colunas}
      dados={aceites.data.itens}
      tamanhoPagina={10}
      vazio={<EstadoVazio descricao={t('aceitesVazio')} />}
    />
  );
}

function Exportacao({ escopo }: { escopo: 'titular' | 'escritorio' }) {
  const t = useTranslations('privacidade');
  const exportar = useExportarDados();
  const [id, setId] = useState<string>();
  return (
    <div className="space-y-3">
      <Botao
        variante="secundaria"
        carregando={exportar.isPending}
        onClick={() => {
          exportar.mutate(escopo, {
            onSuccess: (resultado) => {
              setId(resultado.id);
            },
          });
        }}
      >
        {t('exportar')}
      </Botao>
      {id === undefined ? null : <AndamentoDaExportacao id={id} />}
    </div>
  );
}

function AndamentoDaExportacao({ id }: { id: string }) {
  const t = useTranslations('privacidade');
  const exportacao = useExportacao(id);
  const dados = exportacao.data;
  if (dados === undefined || dados.situacao === 'pendente') {
    return (
      <p role="status" className="text-sm text-texto-suave">
        {t('exportacaoPendente')}
      </p>
    );
  }
  return (
    <div role="status" className="space-y-1 text-sm">
      <p>
        {t('exportacaoPronta', {
          data: dados.expiraEm === null ? '' : formatarInstante(dados.expiraEm),
        })}
      </p>
      <ul className="list-disc ps-5">
        {dados.arquivos.map((arquivo) => (
          <li key={arquivo.nome}>
            <a
              href={arquivo.url}
              className="underline underline-offset-4"
              rel="noreferrer noopener"
            >
              {t('baixar', { arquivo: arquivo.nome })}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Encerramento() {
  const t = useTranslations('privacidade');
  const encerramento = useEncerramento();
  const encerrar = useEncerrarConta();
  const cancelar = useCancelarEncerramento();
  const [aberto, setAberto] = useState(false);
  const dados = encerramento.data;
  if (dados === undefined) return <EstadoCarregando />;
  if (dados.situacao === 'em-carencia' || dados.situacao === 'vencido') {
    return (
      <div className="space-y-3">
        <p role="status" className="text-sm">
          {dados.situacao === 'vencido'
            ? t('vencido')
            : t('emCarencia', {
                pedido: formatarInstante(dados.solicitadoEm ?? ''),
                efetivar: formatarInstante(dados.efetivarEm ?? ''),
              })}
        </p>
        {dados.situacao === 'em-carencia' ? (
          <Botao
            variante="secundaria"
            carregando={cancelar.isPending}
            onClick={() => {
              cancelar.mutate(undefined, {
                onSuccess: () => {
                  avisar.sucesso(t('cancelado'));
                },
              });
            }}
          >
            {t('cancelar')}
          </Botao>
        ) : null}
      </div>
    );
  }
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="perigo">{t('encerrar')}</Botao>}
      titulo={t('encerrarConfirmarTitulo')}
      descricao={t('encerrarConfirmarDescricao')}
      acoes={
        <>
          <FecharDialogo asChild>
            <Botao variante="secundaria">{t('voltar')}</Botao>
          </FecharDialogo>
          <Botao
            variante="perigo"
            carregando={encerrar.isPending}
            onClick={() => {
              encerrar.mutate(undefined, {
                onSuccess: (resultado) => {
                  setAberto(false);
                  avisar.sucesso(
                    t('encerramentoSolicitado', {
                      data: formatarInstante(resultado.efetivarEm ?? ''),
                    }),
                  );
                },
              });
            }}
          >
            {t('encerrarConfirmar')}
          </Botao>
        </>
      }
    >
      {null}
    </Dialogo>
  );
}
