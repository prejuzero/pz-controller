'use client';

import { Botao, EstadoCarregando, SeloStatus } from '@pz/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useLinkDoDocumento, usePrazo } from '../../../../api/hooks';
import { formatarDataCivil, formatarInstante } from '../../../../i18n/formatar';

import { AcoesDoPrazo } from './acoes-do-prazo';

import type { DetalheDoPrazo } from '@pz/contracts';

/** Memória de cálculo como o motor a grava (CLAUDE.md, seção 4.4); só exibida, nunca calculada. */
interface Memoria {
  situacao?: string;
  detalhe?: string;
  publicacao?: string;
  inicio?: string;
  diasDesconsiderados?: { data: string; motivo: string; fundamento: string; urlAto?: string }[];
  fundamentos?: string[];
  avisos?: string[];
  alternativas?: { vencimento: string; descricao: string; fundamentos: string[] }[];
}

const comoMemoria = (valor: unknown): Memoria =>
  valor !== null && typeof valor === 'object' ? valor : {};
const documentoDe = (parametros: unknown) =>
  (parametros as { documento?: string } | null)?.documento;
const prazoNoTexto = (parametros: unknown) =>
  (parametros as { prazoNoTexto?: { dias: number; unidade: string } } | null)?.prazoNoTexto;

/** Detalhe do prazo (HU24): datas, memória de cálculo, fundamento, origem e ações. */
export function DetalhePrazo({ id }: { id: string }) {
  const t = useTranslations('prazos');
  const prazo = usePrazo(id);
  if (prazo.data === undefined) return <EstadoCarregando />;
  const p: DetalheDoPrazo = prazo.data;
  const m = comoMemoria(p.memoria);
  const texto = prazoNoTexto(p.parametros);

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/prazos"
        className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('detalhe.voltar')}
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">
          {p.tipoAto} · {p.vencimento === null ? t('semData') : formatarDataCivil(p.vencimento)}
        </h1>
        <div className="flex flex-wrap gap-2">
          <SeloStatus tom={p.status === 'vencido' ? 'perigo' : 'info'}>
            {t(`abas.${p.status}`)}
          </SeloStatus>
          {p.vencimentoManual ? <SeloStatus tom="neutro">{t('manual')}</SeloStatus> : null}
          {p.classificacaoIncerta ? <SeloStatus tom="alerta">{t('incerta')}</SeloStatus> : null}
        </div>
        <p className="text-sm text-texto-suave">{t('detalhe.aviso')}</p>
      </div>

      <AcoesDoPrazo prazo={p} />
      {documentoDe(p.parametros) === undefined ? null : <AbrirDocumento id={p.id} />}

      <dl className="grid gap-3 rounded-lg border border-borda p-4 sm:grid-cols-2">
        <Item rotulo={t('detalhe.aplicado')}>
          {p.dias === null ? '—' : `${String(p.dias)} ${p.unidade ?? ''}`}
        </Item>
        <Item rotulo={t('detalhe.noTexto')}>
          {texto === undefined ? t('detalhe.naoCitado') : `${String(texto.dias)} ${texto.unidade}`}
        </Item>
        <Item rotulo={t('detalhe.fundamento')}>{p.fundamento ?? '—'}</Item>
        <Item rotulo={t('colunas.origem')}>{t(`origem.${p.origem}`)}</Item>
        {m.publicacao === undefined ? null : (
          <Item rotulo={t('detalhe.publicacaoEm')}>{formatarDataCivil(m.publicacao)}</Item>
        )}
        {p.inicio === null ? null : (
          <Item rotulo={t('detalhe.inicio')}>{formatarDataCivil(p.inicio)}</Item>
        )}
        {p.fimDoPrazo === null ? null : (
          <Item rotulo={t('detalhe.fimDoPrazo')}>
            {formatarInstante(p.fimDoPrazo, p.fusoDoJuizo ?? undefined)}
          </Item>
        )}
        <Item rotulo={t('detalhe.fuso')}>{p.fusoDoJuizo ?? '—'}</Item>
        {p.motivoAjuste === null ? null : (
          <Item rotulo={t('detalhe.motivoAjuste')}>{p.motivoAjuste}</Item>
        )}
        <Item rotulo={t('colunas.processo')}>
          <Link href={`/processos/${p.processoId}`} className="underline underline-offset-4">
            {t('detalhe.processo')}
          </Link>
          {p.publicacaoConteudoId === null ? null : (
            <>
              {' · '}
              <Link
                href={`/publicacoes/${p.publicacaoConteudoId}`}
                className="underline underline-offset-4"
              >
                {t('detalhe.publicacao')}
              </Link>
            </>
          )}
        </Item>
      </dl>

      <section className="space-y-3" aria-labelledby="memoria">
        <h2 id="memoria" className="text-lg font-semibold">
          {t('detalhe.memoria')}
        </h2>
        {m.situacao === 'a-confirmar' ? (
          <p>{t('detalhe.aConfirmar', { detalhe: m.detalhe ?? '—' })}</p>
        ) : null}
        {m.avisos !== undefined && m.avisos.length > 0 ? (
          <Lista titulo={t('detalhe.avisos')} itens={m.avisos} />
        ) : null}
        <h3 className="font-medium">{t('detalhe.diasDesconsiderados')}</h3>
        {m.diasDesconsiderados === undefined || m.diasDesconsiderados.length === 0 ? (
          <p className="text-sm text-texto-suave">{t('detalhe.semDiasDesconsiderados')}</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {m.diasDesconsiderados.map((dia) => (
              <li key={`${dia.data}-${dia.motivo}`}>
                {formatarDataCivil(dia.data)}: {dia.motivo} ({dia.fundamento})
              </li>
            ))}
          </ul>
        )}
        {m.fundamentos !== undefined && m.fundamentos.length > 0 ? (
          <Lista titulo={t('detalhe.fundamentos')} itens={m.fundamentos} />
        ) : null}
        {m.alternativas !== undefined && m.alternativas.length > 0 ? (
          <Lista
            titulo={t('detalhe.alternativas')}
            itens={m.alternativas.map(
              (a) =>
                `${formatarDataCivil(a.vencimento)}: ${a.descricao} (${a.fundamentos.join('; ')})`,
            )}
          />
        ) : null}
        <p className="text-xs text-texto-suave">
          {t('detalhe.versoes', { motor: p.versaoMotor, tabela: String(p.versaoTabela ?? '—') })}
        </p>
      </section>
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: readonly string[] }) {
  return (
    <div className="space-y-1">
      <h3 className="font-medium">{titulo}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {itens.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-texto-suave">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Abre o PDF de origem por link assinado e curto (gerado na hora, nunca guardado na tela). */
function AbrirDocumento({ id }: { id: string }) {
  const t = useTranslations('prazos.detalhe');
  const link = useLinkDoDocumento();
  return (
    <Botao
      variante="secundaria"
      carregando={link.isPending}
      onClick={() => {
        link.mutate(id, {
          onSuccess: ({ url }) => {
            window.open(url, '_blank', 'noopener,noreferrer');
          },
        });
      }}
    >
      {t('documento')}
    </Botao>
  );
}
