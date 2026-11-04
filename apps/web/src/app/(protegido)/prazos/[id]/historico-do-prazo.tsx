'use client';

import { avisar, Botao, EstadoCarregando, EstadoVazio } from '@pz/ui';
import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useHistoricoDoPrazo, usePermissao, useSolicitarRelatorio } from '../../../../api/hooks';
import { formatarInstante } from '../../../../i18n/formatar';

const MARCADOR = '$dadoPessoal';

/** Valor legível do antes/depois: dado pessoal (ADR-018) não aparece, só que existe. */
function legivel(valor: unknown, rotuloPessoal: string): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'object' && !Array.isArray(valor) && MARCADOR in valor) return rotuloPessoal;
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean')
    return String(valor);
  return JSON.stringify(valor);
}

/** Campos que mudaram entre o antes e o depois (os dois são objetos JSON da trilha). */
function diferencas(antes: unknown, depois: unknown): [string, unknown, unknown][] {
  const a = (typeof antes === 'object' && antes !== null ? antes : {}) as Record<string, unknown>;
  const d = (typeof depois === 'object' && depois !== null ? depois : {}) as Record<
    string,
    unknown
  >;
  return [...new Set([...Object.keys(a), ...Object.keys(d)])]
    .filter((c) => JSON.stringify(a[c]) !== JSON.stringify(d[c]))
    .map((c) => [c, a[c], d[c]]);
}

/**
 * Histórico do prazo (HU35, RF86): a trilha do prazo e das notificações dele, com quem, por onde
 * e quando (horário do servidor, em Brasília), o que mudou e o hash de cada registro. O PDF
 * verificável sai pelo pipeline de relatórios.
 */
export function HistoricoDoPrazo({ prazoId }: { prazoId: string }) {
  const t = useTranslations('prazos.historico');
  const historico = useHistoricoDoPrazo(prazoId);
  const exportar = useSolicitarRelatorio();
  const podeExportar = usePermissao('relatorios:exportar') === true;

  return (
    <section aria-labelledby="historico-titulo" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="historico-titulo" className="flex items-center gap-2 text-lg font-semibold">
          <History className="size-5" aria-hidden />
          {t('titulo')}
        </h2>
        {podeExportar ? (
          <Botao
            variante="secundaria"
            tamanho="sm"
            carregando={exportar.isPending}
            onClick={() => {
              exportar.mutate(
                { tipo: 'historico-prazo', formato: 'pdf', filtros: { prazoId } },
                {
                  onSuccess: () => {
                    avisar.sucesso(t('exportado'), t('exportadoDescricao'));
                  },
                },
              );
            }}
          >
            {t('exportar')}
          </Botao>
        ) : null}
      </div>
      {historico.data === undefined ? (
        <EstadoCarregando />
      ) : historico.data.itens.length === 0 ? (
        <EstadoVazio descricao={t('vazio')} />
      ) : (
        <ol className="space-y-3 border-l border-borda pl-4">
          {historico.data.itens.map((e) => {
            const mudancas = diferencas(e.antes, e.depois);
            // O ponto separa níveis no catálogo: "prazos.prazo-confirmado" vira "prazos_prazo-confirmado".
            const chaveDoTipo = `tipos.${e.tipo.replace('.', '_')}`;
            return (
              <li key={e.sequencia} className="space-y-1 text-sm">
                <p className="font-medium">
                  {t.has(chaveDoTipo as Parameters<typeof t.has>[0])
                    ? t(chaveDoTipo as Parameters<typeof t>[0])
                    : e.tipo}
                </p>
                <p className="text-texto-suave">
                  {formatarInstante(e.criadoEm)} ·{' '}
                  {e.usuario === null ? t('sistema') : (e.usuario.nome ?? t('usuario'))} ·{' '}
                  {t.has(`canais.${e.canal}` as Parameters<typeof t.has>[0])
                    ? t(`canais.${e.canal}` as Parameters<typeof t>[0])
                    : e.canal}
                </p>
                {mudancas.length === 0 ? null : (
                  <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
                    {mudancas.map(([campo, antes, depois]) => (
                      <div key={campo} className="contents">
                        <dt className="text-texto-suave">{campo}</dt>
                        <dd className="break-words">
                          {t('mudou', {
                            antes: legivel(antes, t('dadoPessoal')),
                            depois: legivel(depois, t('dadoPessoal')),
                          })}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="break-all font-mono text-xs text-texto-suave">
                  {t('hash', { hash: e.hash })}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
