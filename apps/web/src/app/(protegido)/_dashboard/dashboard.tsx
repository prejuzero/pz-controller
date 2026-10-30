'use client';

import { CardIndicador, cn, Esqueleto, EstadoVazio, SeloStatus, type TomSelo } from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useLinhaDoTempo, useProximosPrazos, useResumoDoDashboard } from '../../../api/hooks';
import { formatarDataCivil } from '../../../i18n/formatar';

import type { ResumoDoDashboard } from '@pz/contracts';

type Indicador = Exclude<keyof ResumoDoDashboard, 'semCienciaConfirmada'>;

/** Cada card abre a lista com o mesmo critério da contagem (o servidor aplica o "hoje"). */
const CARDS: readonly { chave: Indicador; href: string }[] = [
  { chave: 'vencemHoje', href: '/prazos?recorte=vence-hoje' },
  { chave: 'proximos7Dias', href: '/prazos?recorte=proximos-7-dias' },
  { chave: 'vencidosNaoCumpridos', href: '/prazos?recorte=vencidos' },
  { chave: 'novasPublicacoes', href: '/publicacoes?novas=true' },
  { chave: 'aguardandoConfirmacao', href: '/prazos?status=a-confirmar' },
  { chave: 'processosMonitorados', href: '/processos' },
];

const LINK_DO_CARD =
  'block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco';

/** Cor por urgência: vence hoje em vermelho, até 2 dias úteis em amarelo. */
function tomDaUrgencia(dias: number | null): TomSelo {
  if (dias === null) return 'neutro';
  if (dias === 0) return 'perigo';
  return dias <= 2 ? 'alerta' : 'neutro';
}

/**
 * Dashboard do escritório (HU26): cards de situação, linha do tempo e próximos prazos. As áreas
 * `data-dinamico` mudam todo dia; a regressão visual as mascara.
 */
export function Dashboard() {
  const t = useTranslations('dashboard');
  const resumo = useResumoDoDashboard();
  const linha = useLinhaDoTempo();
  const proximos = useProximosPrazos();
  const maximo = Math.max(1, ...(linha.data?.itens ?? []).map((d) => d.quantidade));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('titulo')}</h1>

      <Link href="/prazos?recorte=sem-ciencia" className={LINK_DO_CARD} data-dinamico>
        <CardIndicador
          titulo={t('cards.semCienciaConfirmada')}
          valor={resumo.data?.semCienciaConfirmada ?? <Esqueleto className="h-9 w-16" />}
          descricao={t('descricoes.semCienciaConfirmada')}
          className="border-2 border-alerta"
        />
      </Link>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map(({ chave, href }) => (
          <Link key={chave} href={href} className={LINK_DO_CARD} data-dinamico>
            <CardIndicador
              titulo={t(`cards.${chave}`)}
              valor={resumo.data?.[chave] ?? <Esqueleto className="h-9 w-16" />}
            />
          </Link>
        ))}
      </div>

      <section className="space-y-3" aria-labelledby="linha-do-tempo">
        <h2 id="linha-do-tempo" className="text-lg font-semibold">
          {t('linhaDoTempo.titulo')}
        </h2>
        {linha.data === undefined ? (
          <Esqueleto className="h-40 w-full" />
        ) : (
          <>
            {/* Barras só visuais; a tabela abaixo é a alternativa textual (leitores de tela). */}
            <div className="flex h-40 items-end gap-1" aria-hidden data-dinamico>
              {linha.data.itens.map((dia, i) => (
                <div key={dia.data} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                  <div
                    className={cn('rounded-t bg-primaria', dia.quantidade === 0 && 'bg-borda')}
                    style={{ height: `${String(Math.max(2, (dia.quantidade / maximo) * 100))}%` }}
                    title={`${formatarDataCivil(dia.data)}: ${String(dia.quantidade)}`}
                  />
                  {/* Legenda a cada 5 dias: 30 rótulos não cabem em 360 px. */}
                  <span className="mt-1 h-3 text-center text-[10px] leading-3 text-texto-suave">
                    {i % 5 === 0 ? dia.data.slice(8, 10) : ''}
                  </span>
                </div>
              ))}
            </div>
            <table className="sr-only">
              <caption>{t('linhaDoTempo.titulo')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('linhaDoTempo.data')}</th>
                  <th scope="col">{t('linhaDoTempo.quantidade')}</th>
                </tr>
              </thead>
              <tbody>
                {linha.data.itens.map((dia) => (
                  <tr key={dia.data}>
                    <td>{formatarDataCivil(dia.data)}</td>
                    <td>{dia.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="proximos-prazos">
        <h2 id="proximos-prazos" className="text-lg font-semibold">
          {t('proximos.titulo')}
        </h2>
        {proximos.data === undefined ? (
          <Esqueleto className="h-32 w-full" />
        ) : proximos.data.itens.length === 0 ? (
          <EstadoVazio descricao={t('proximos.vazio')} />
        ) : (
          <ul className="divide-y divide-borda rounded-lg border border-borda" data-dinamico>
            {proximos.data.itens.map((prazo) => (
              <li key={prazo.id}>
                <Link
                  href={`/prazos/${prazo.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-superficie-elevada"
                >
                  <span className="space-x-2">
                    <span className="font-medium">
                      {prazo.vencimento === null ? '' : formatarDataCivil(prazo.vencimento)}
                    </span>
                    <span>{prazo.tipoAto}</span>
                    <span className="text-texto-suave">{prazo.jurisdicao.tribunal ?? ''}</span>
                  </span>
                  <SeloStatus tom={tomDaUrgencia(prazo.diasUteisRestantes)}>
                    {prazo.diasUteisRestantes === null
                      ? t('proximos.semContagem')
                      : t('proximos.diasUteis', { dias: prazo.diasUteisRestantes })}
                  </SeloStatus>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
