'use client';

import { Botao, cn, EstadoCarregando, SeloStatus } from '@pz/ui';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAgenda } from '../../../api/hooks';
import { campos } from '../../../filtro-global';
import { formatarDataCivil } from '../../../i18n/formatar';
import { BotoesExportar } from '../_casca/exportar';
import { BarraDeFiltroGlobal, useFiltroGlobal } from '../_casca/filtro-global';

import {
  dataNoFuso,
  diasDaGrade,
  ehDataCivil,
  horaNoFuso,
  navegar,
  porDia,
  type Visao,
} from './grade';

import type { Agenda } from '@pz/contracts';

const APLICADOS = ['de', 'responsavelId', 'tribunal', 'clienteId'] as const;

type Prazo = Agenda['prazos'][number];
type Compromisso = Agenda['compromissos'][number];
type DiaNaoUtil = Agenda['diasNaoUteis'][number];

interface DoDia {
  prazos: Prazo[];
  compromissos: Compromisso[];
  feriados: DiaNaoUtil[];
}

/**
 * Calendário de prazos (HU27, RF42): visões mensal e semanal e, no celular, lista por dia. Datas
 * civis vindas da API, sem conversão; compromissos (instantes) no dia e hora de Brasília.
 * Visão e data ficam na URL junto com o filtro global; o período do filtro vira a data inicial.
 */
export function CalendarioDePrazos({ hoje }: { hoje: string }) {
  const t = useTranslations('agenda');
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const filtro = useFiltroGlobal();
  const visao: Visao = busca.get('visao') === 'semana' ? 'semana' : 'mes';
  const dataDaUrl = busca.get('data');
  const ancora = ehDataCivil(dataDaUrl) ? dataDaUrl : (filtro.de ?? hoje);
  const dias = diasDaGrade(ancora, visao);
  const de = dias[0] ?? ancora;
  const ate = dias.at(-1) ?? ancora;
  const agenda = useAgenda({
    de,
    ate,
    ...campos(filtro, ['responsavelId', 'tribunal', 'clienteId']),
  });

  const ir = (mudancas: Record<string, string>) => {
    const nova = new URLSearchParams(busca);
    for (const [chave, valor] of Object.entries(mudancas)) nova.set(chave, valor);
    router.replace(`${caminho}?${nova.toString()}`, { scroll: false });
  };

  const prazos = porDia(agenda.data?.prazos ?? [], (p) => p.vencimento);
  const compromissos = porDia(agenda.data?.compromissos ?? [], (c) =>
    dataNoFuso(new Date(c.dataHora)),
  );
  const feriados = porDia(agenda.data?.diasNaoUteis ?? [], (d) => d.data);
  const doDia = (dia: string): DoDia => ({
    prazos: prazos.get(dia) ?? [],
    compromissos: compromissos.get(dia) ?? [],
    feriados: feriados.get(dia) ?? [],
  });
  const mesDaAncora = ancora.slice(0, 7);
  const titulo =
    visao === 'mes'
      ? new Intl.DateTimeFormat('pt-BR', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${ancora}T12:00:00Z`))
      : `${formatarDataCivil(de)} – ${formatarDataCivil(ate)}`;
  const comItens = dias.filter((dia) => {
    const d = doDia(dia);
    return d.prazos.length + d.compromissos.length + d.feriados.length > 0;
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="text-texto-suave">{t('descricao')}</p>
      </div>

      <BarraDeFiltroGlobal aplicados={APLICADOS} />
      {/* A agenda do período visível, com o mesmo filtro (HU29). */}
      <BotoesExportar
        pedido={(formato) => ({
          tipo: 'agenda',
          formato,
          filtros: { de, ate, ...campos(filtro, ['responsavelId', 'tribunal', 'clienteId']) },
        })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Botao
          variante="secundaria"
          onClick={() => {
            ir({ data: navegar(ancora, visao, -1) });
          }}
        >
          {t('anterior')}
        </Botao>
        <Botao
          variante="secundaria"
          onClick={() => {
            ir({ data: hoje });
          }}
        >
          {t('hoje')}
        </Botao>
        <Botao
          variante="secundaria"
          onClick={() => {
            ir({ data: navegar(ancora, visao, 1) });
          }}
        >
          {t('proximo')}
        </Botao>
        <h2 className="mx-2 text-lg font-semibold first-letter:uppercase" aria-live="polite">
          {titulo}
        </h2>
        <div role="group" aria-label={t('visao')} className="ml-auto flex gap-1">
          {(['mes', 'semana'] as const).map((v) => (
            <Botao
              key={v}
              variante={v === visao ? 'primaria' : 'fantasma'}
              aria-pressed={v === visao}
              onClick={() => {
                ir({ visao: v, data: ancora });
              }}
            >
              {t(v)}
            </Botao>
          ))}
        </div>
      </div>

      {agenda.data?.prazosTruncados === true ? (
        <p role="status" className="rounded-md border-2 border-alerta p-3 text-sm">
          {t('truncado')}
        </p>
      ) : null}

      {agenda.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <>
          {/* Tela grande: grade de domingo a sábado. */}
          <div className="hidden md:block" data-testid="grade-calendario">
            <div className="grid grid-cols-7 gap-px text-center text-sm font-semibold" aria-hidden>
              {(t.raw('diasDaSemana') as string[]).map((nome) => (
                <div key={nome} className="py-1">
                  {nome}
                </div>
              ))}
            </div>
            <ol className="grid grid-cols-7 gap-px rounded-lg border border-borda bg-borda">
              {dias.map((dia) => (
                <CelulaDoDia
                  key={dia}
                  dia={dia}
                  itens={doDia(dia)}
                  hoje={dia === hoje}
                  foraDoMes={visao === 'mes' && !dia.startsWith(mesDaAncora)}
                  alta={visao === 'semana'}
                />
              ))}
            </ol>
          </div>
          {/* Celular: lista só dos dias com algo. */}
          <div className="md:hidden" data-testid="lista-calendario">
            {comItens.length === 0 ? (
              <p className="text-texto-suave">{t('vazio')}</p>
            ) : (
              <ol className="space-y-3">
                {comItens.map((dia) => (
                  <li key={dia} className="rounded-lg border border-borda p-3">
                    <h3 className="font-semibold">{formatarDataCivil(dia)}</h3>
                    <ItensDoDia itens={doDia(dia)} />
                  </li>
                ))}
              </ol>
            )}
          </div>
          <p className="text-sm text-texto-suave">{t('legendaFeriados')}</p>
        </>
      )}
    </div>
  );
}

function CelulaDoDia({
  dia,
  itens,
  hoje,
  foraDoMes,
  alta,
}: {
  dia: string;
  itens: DoDia;
  hoje: boolean;
  foraDoMes: boolean;
  alta: boolean;
}) {
  const semExpediente = itens.feriados.length > 0;
  return (
    <li
      className={cn(
        'min-h-28 bg-superficie p-1.5 text-left',
        alta && 'min-h-64',
        foraDoMes && 'bg-superficie-elevada text-texto-suave',
        semExpediente && 'border-t-4 border-alerta',
      )}
      aria-current={hoje ? 'date' : undefined}
      data-dia={dia}
    >
      <h3 className={cn('text-sm font-semibold', hoje && 'text-primaria underline')}>
        <span className="sr-only">{formatarDataCivil(dia)}</span>
        <span aria-hidden>{Number(dia.slice(8))}</span>
      </h3>
      <ItensDoDia itens={itens} />
    </li>
  );
}

function ItensDoDia({ itens }: { itens: DoDia }) {
  const t = useTranslations('agenda');
  return (
    <ul className="mt-1 space-y-1 text-xs">
      {itens.feriados.map((f) => (
        <li key={`${f.fonte.eventoId}-${f.data}`}>
          <SeloStatus tom="alerta">{t('semExpediente', { motivo: f.motivo })}</SeloStatus>
        </li>
      ))}
      {itens.prazos.map((p) => (
        <li key={p.id}>
          <Link
            href={`/prazos/${p.id}`}
            className="block truncate rounded px-1 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-foco"
          >
            {t('prazo', { ato: p.tipoAto })}
            {p.status === 'a-confirmar' ? (
              <SeloStatus tom="alerta" className="ml-1">
                {t('aConfirmar')}
              </SeloStatus>
            ) : null}
          </Link>
        </li>
      ))}
      {itens.compromissos.map((c) => (
        <li key={c.id} className="truncate px-1">
          {t('compromisso', { hora: horaNoFuso(new Date(c.dataHora)), titulo: c.titulo })}
        </li>
      ))}
    </ul>
  );
}
