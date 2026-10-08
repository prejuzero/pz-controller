'use client';

import { avisar, Botao, EstadoCarregando } from '@pz/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { useAceitarTermos, useTermosPendentes } from '../../api/hooks';
import { formatarInstante } from '../../i18n/formatar';
import { retornoSeguro } from '../../rotas';

/** Novo aceite após mudança de versão (HU38): resumo das alterações, texto e confirmação. */
export function AceiteDeTermos({ retorno }: { retorno: string | undefined }) {
  const t = useTranslations('aceiteTermos');
  const tl = useTranslations('legal');
  const router = useRouter();
  const pendentes = useTermosPendentes();
  const aceitar = useAceitarTermos();
  const [concordo, setConcordo] = useState(false);
  const idConcordo = useId();
  const destino = retornoSeguro(retorno);
  const itens = pendentes.data?.itens;
  return (
    <div className="min-h-dvh bg-fundo text-texto">
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
          <p className="text-sm text-texto-suave">{t('descricao')}</p>
        </div>
        {itens === undefined ? (
          <EstadoCarregando />
        ) : itens.length === 0 ? (
          <div className="space-y-3">
            <p>{t('nenhum')}</p>
            <Botao
              onClick={() => {
                router.replace(destino);
              }}
            >
              {t('continuar')}
            </Botao>
          </div>
        ) : (
          <>
            {itens.map((documento) => (
              <section key={documento.id} className="space-y-2">
                <h2 className="text-lg font-semibold">{tl(documento.tipo)}</h2>
                <p className="text-sm text-texto-suave">
                  {tl('versao', {
                    versao: documento.versao,
                    data: formatarInstante(documento.publicadoEm),
                  })}
                </p>
                <p className="text-sm">
                  {documento.resumoAlteracoes === null
                    ? t('semResumo')
                    : t('resumo', { resumo: documento.resumoAlteracoes })}
                </p>
                <div
                  role="region"
                  aria-label={t('conteudo', { documento: tl(documento.tipo) })}
                  tabIndex={0}
                  className="max-h-64 overflow-auto rounded-md border border-borda bg-superficie p-3 text-sm whitespace-pre-wrap"
                >
                  {documento.conteudo}
                </div>
              </section>
            ))}
            <div className="flex items-start gap-2">
              <input
                id={idConcordo}
                type="checkbox"
                className="mt-1 size-4 accent-primaria"
                checked={concordo}
                onChange={(evento) => {
                  setConcordo(evento.target.checked);
                }}
              />
              <label htmlFor={idConcordo} className="text-sm">
                {t('concordo')}
              </label>
            </div>
            <Botao
              disabled={!concordo}
              carregando={aceitar.isPending}
              onClick={() => {
                aceitar.mutate(
                  itens.map((d) => d.id),
                  {
                    onSuccess: () => {
                      avisar.sucesso(t('aceitos'));
                      router.replace(destino);
                    },
                  },
                );
              }}
            >
              {t('aceitar')}
            </Botao>
          </>
        )}
      </main>
    </div>
  );
}
