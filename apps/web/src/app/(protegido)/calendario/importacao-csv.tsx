'use client';

import { avisar, Botao, classesEntrada, cn, Dialogo, EnvoltorioCampo } from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { useImportarCalendario } from '../../../api/hooks';

import type { ResultadoDaImportacao } from '@pz/contracts';

/**
 * Importação de eventos por CSV (HU13): primeiro a prévia (nada é gravado); só um arquivo sem
 * problemas pode ser gravado, e os eventos entram como rascunho para a aprovação de outro curador.
 */
export function ImportacaoCsv({ gatilho }: { gatilho: ReactNode }) {
  const t = useTranslations('calendario.importar');
  const importar = useImportarCalendario();
  const [aberto, setAberto] = useState(false);
  const [csv, setCsv] = useState('');
  const [previa, setPrevia] = useState<ResultadoDaImportacao | null>(null);
  const problemas = previa?.linhas.filter((linha) => linha.problemas.length > 0) ?? [];

  const mudarCsv = (valor: string) => {
    setCsv(valor);
    setPrevia(null);
  };
  const enviar = (somentePrevia: boolean) => {
    importar.mutate(
      { csv, somentePrevia },
      {
        onSuccess: (resultado) => {
          if (somentePrevia) {
            setPrevia(resultado);
            return;
          }
          avisar.sucesso(t('gravados', { total: resultado.propostos.length }));
          setAberto(false);
          mudarCsv('');
        },
      },
    );
  };

  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={gatilho}
      titulo={t('titulo')}
      descricao={t('descricao')}
      acoes={
        previa !== null && problemas.length === 0 ? (
          <Botao
            carregando={importar.isPending}
            onClick={() => {
              enviar(false);
            }}
          >
            {t('gravar')}
          </Botao>
        ) : (
          <Botao
            disabled={csv.trim() === ''}
            carregando={importar.isPending}
            onClick={() => {
              enviar(true);
            }}
          >
            {t('validar')}
          </Botao>
        )
      }
    >
      <div className="grid gap-4">
        <EnvoltorioCampo rotulo={t('arquivo')}>
          {({ id }) => (
            <input
              id={id}
              type="file"
              accept=".csv,text/csv"
              className="text-sm"
              onChange={(evento) => {
                void evento.target.files?.[0]?.text().then(mudarCsv);
              }}
            />
          )}
        </EnvoltorioCampo>
        <EnvoltorioCampo rotulo={t('conteudo')} obrigatorio>
          {({ id, descricao, invalido }) => (
            <textarea
              id={id}
              aria-describedby={descricao}
              aria-invalid={invalido}
              rows={6}
              spellCheck={false}
              className={cn(classesEntrada, 'h-auto py-2 font-mono text-xs')}
              value={csv}
              onChange={(evento) => {
                mudarCsv(evento.target.value);
              }}
            />
          )}
        </EnvoltorioCampo>
        {previa === null ? null : (
          <div role="status" className="grid gap-2 text-sm">
            {problemas.length === 0 ? (
              <p>{t('semProblemas', { linhas: previa.linhas.length })}</p>
            ) : (
              <>
                <p className="font-medium text-perigo">{t('comProblemas')}</p>
                <ul className="grid max-h-48 gap-1 overflow-y-auto">
                  {problemas.map((linha) => (
                    <li key={linha.linha}>
                      <span className="font-medium">{t('linha', { linha: linha.linha })}</span>
                      {': '}
                      {linha.problemas.map((p) => `${p.campo} — ${p.mensagem}`).join('; ')}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </Dialogo>
  );
}
