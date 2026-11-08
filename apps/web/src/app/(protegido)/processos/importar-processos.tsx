'use client';

import { COLUNAS_DA_IMPORTACAO_DE_PROCESSOS } from '@pz/contracts';
import { Botao, classesEntrada, cn, Dialogo, EnvoltorioCampo } from '@pz/ui';
import { Download, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  useAoConcluirImportacao,
  useImportacaoDeProcessos,
  useImportarProcessos,
} from '../../../api/hooks';

import type { ResultadoDaImportacaoDeProcessos } from '@pz/contracts';

// Modelo com número FICTÍCIO (dígito verificador válido), só para mostrar o formato.
const MODELO = `${COLUNAS_DA_IMPORTACAO_DE_PROCESSOS.join(';')}\n0000001-68.2026.8.26.0100;1ª Vara Cível;São Paulo;não\n`;
const LINK_DO_MODELO = `data:text/csv;charset=utf-8,${encodeURIComponent(MODELO)}`;

/**
 * Importação de processos por planilha CSV (HU42, RF04): prévia sem gravar, depois o pedido; os
 * processos entram em segundo plano e a tela acompanha até concluir.
 */
export function ImportarProcessos() {
  const t = useTranslations('processos.importar');
  const [aberto, setAberto] = useState(false);
  const [csv, setCsv] = useState('');
  const [previa, setPrevia] = useState<ResultadoDaImportacaoDeProcessos | null>(null);
  const [importacaoId, setImportacaoId] = useState<string | null>(null);
  const importar = useImportarProcessos();
  const andamento = useImportacaoDeProcessos(importacaoId);
  const aoConcluir = useAoConcluirImportacao();
  const concluida = andamento.data?.situacao === 'concluida';

  useEffect(() => {
    if (concluida) void aoConcluir();
  }, [concluida, aoConcluir]);

  const linhas = previa?.linhas ?? [];
  const contar = (situacao: string) => linhas.filter((l) => l.situacao === situacao).length;
  const invalidas = linhas.filter((l) => l.situacao === 'invalida');
  const podeImportar = previa !== null && invalidas.length === 0 && contar('valida') > 0;

  const mudarCsv = (valor: string) => {
    setCsv(valor);
    setPrevia(null);
  };
  const fechar = (abrir: boolean) => {
    setAberto(abrir);
    if (!abrir) {
      mudarCsv('');
      setImportacaoId(null);
    }
  };
  const enviar = (somentePrevia: boolean) => {
    importar.mutate(
      { csv, somentePrevia },
      {
        onSuccess: (resultado) => {
          if (somentePrevia) setPrevia(resultado);
          else setImportacaoId(resultado.importacaoId);
        },
      },
    );
  };

  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={fechar}
      gatilho={
        <Botao variante="secundaria">
          <Upload className="size-4" aria-hidden />
          {t('abrir')}
        </Botao>
      }
      titulo={t('titulo')}
      descricao={t('descricao')}
      acoes={
        importacaoId !== null ? (
          <Botao
            disabled={!concluida}
            onClick={() => {
              fechar(false);
            }}
          >
            {t('fechar')}
          </Botao>
        ) : podeImportar ? (
          <Botao
            carregando={importar.isPending}
            onClick={() => {
              enviar(false);
            }}
          >
            {t('importar', { total: contar('valida') })}
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
      {importacaoId !== null ? (
        <p role="status" className="text-sm">
          {concluida
            ? t('concluida', {
                criados: andamento.data?.criados ?? 0,
                jaExistiam: andamento.data?.jaExistiam ?? 0,
              })
            : t('emAndamento')}
        </p>
      ) : (
        <div className="grid gap-4">
          <a
            href={LINK_DO_MODELO}
            download="modelo-processos.csv"
            className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
          >
            <Download className="size-4" aria-hidden />
            {t('modelo')}
          </a>
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
              <p>
                {t('resumo', {
                  validas: contar('valida'),
                  jaCadastrados: contar('ja-cadastrado'),
                  invalidas: invalidas.length,
                })}
              </p>
              {invalidas.length === 0 ? (
                contar('valida') === 0 ? (
                  <p>{t('nadaNovo')}</p>
                ) : null
              ) : (
                <>
                  <p className="font-medium text-perigo">{t('comProblemas')}</p>
                  <ul className="grid max-h-48 gap-1 overflow-y-auto">
                    {invalidas.map((linha) => (
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
      )}
    </Dialogo>
  );
}
