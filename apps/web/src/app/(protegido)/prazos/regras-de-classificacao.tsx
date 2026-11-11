'use client';

import {
  avisar,
  Botao,
  Campo,
  classesEntrada,
  cn,
  EnvoltorioCampo,
  EstadoCarregando,
  EstadoVazio,
  Selecao,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  useAtivarRegra,
  useProporRegra,
  useRegrasDeClassificacao,
  useRetirarRegra,
  useSessao,
  useTiposDeAto,
} from '../../../api/hooks';
import { AlertaFormulario } from '../../_acesso/alerta-formulario';

import type { RegraDeClassificacao } from '@pz/contracts';

const TOM = {
  proposta: 'alerta',
  ativa: 'sucesso',
  retirada: 'neutro',
  substituida: 'neutro',
} as const;

/**
 * Curadoria das regras rápidas (PZ-313): versões propostas por uma curadora e ativadas por
 * outra (quatro olhos), como a tabela de prazos. A regra é do módulo classificação, na API.
 */
export function RegrasDeClassificacao() {
  const t = useTranslations('regrasDeClassificacao');
  const regras = useRegrasDeClassificacao();
  const eu = useSessao().data?.usuarioId;
  const ativar = useAtivarRegra();
  const retirar = useRetirarRegra();

  const colunas: ColunaTabela<RegraDeClassificacao>[] = [
    { accessorKey: 'codigo', header: t('colunas.codigo') },
    { accessorKey: 'versao', header: t('colunas.versao') },
    { accessorKey: 'tipoAto', header: t('colunas.ato') },
    {
      id: 'padroes',
      header: t('colunas.padroes'),
      cell: ({ row }) => (
        <code className="text-xs break-all">{row.original.padroes.join(' | ')}</code>
      ),
    },
    { accessorKey: 'confianca', header: t('colunas.confianca') },
    {
      id: 'situacao',
      header: t('colunas.situacao'),
      cell: ({ row }) => (
        <SeloStatus tom={TOM[row.original.situacao]}>
          {t(`situacoes.${row.original.situacao}`)}
        </SeloStatus>
      ),
    },
    {
      id: 'acoes',
      header: t('colunas.acoes'),
      cell: ({ row }) => {
        const r = row.original;
        if (r.situacao === 'proposta') {
          return r.propostaPor === eu ? (
            <span className="text-xs text-texto-suave">{t('suaProposta')}</span>
          ) : (
            <Botao
              variante="secundaria"
              carregando={ativar.isPending}
              onClick={() => {
                ativar.mutate(
                  { codigo: r.codigo, versao: r.versao },
                  { onSuccess: () => avisar.sucesso(t('ativada')) },
                );
              }}
            >
              {t('ativar')}
            </Botao>
          );
        }
        return r.situacao === 'ativa' ? (
          <Botao
            variante="perigo"
            carregando={retirar.isPending}
            onClick={() => {
              retirar.mutate(r.codigo, { onSuccess: () => avisar.sucesso(t('retirada')) });
            }}
          >
            {t('retirar')}
          </Botao>
        ) : null;
      },
    },
  ];

  return (
    <section className="space-y-4" aria-labelledby="regras-de-classificacao">
      <div className="space-y-2">
        <h2 id="regras-de-classificacao" className="text-xl font-semibold">
          {t('titulo')}
        </h2>
        <p className="max-w-3xl text-sm text-texto-suave">{t('descricao')}</p>
      </div>
      <AlertaFormulario
        erro={ativar.error ?? retirar.error}
        seNaoAutorizado="credenciaisInvalidas"
      />
      {regras.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <TabelaDados
          titulo={t('titulo')}
          colunas={colunas}
          dados={regras.data.itens}
          idLinha={(r) => `${r.codigo}@${String(r.versao)}`}
          vazio={<EstadoVazio descricao={t('vazio')} />}
        />
      )}
      <NovaRegra />
    </section>
  );
}

function NovaRegra() {
  const t = useTranslations('regrasDeClassificacao');
  const tipos = useTiposDeAto();
  const propor = useProporRegra();
  const [codigo, setCodigo] = useState('');
  const [tipoAto, setTipoAto] = useState<string | undefined>(undefined);
  const [padroes, setPadroes] = useState('');
  const [confianca, setConfianca] = useState('0.95');
  const opcoes = (tipos.data?.itens ?? []).map((a) => ({ valor: a.codigo, rotulo: a.nome }));
  return (
    <form
      method="post"
      noValidate
      className="grid max-w-xl gap-3 rounded-md border border-borda p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (tipoAto === undefined) return;
        propor.mutate(
          {
            codigo: codigo.trim(),
            tipoAto,
            padroes: padroes
              .split('\n')
              .map((p) => p.trim())
              .filter((p) => p !== ''),
            confianca: Number(confianca),
          },
          {
            onSuccess: () => {
              setPadroes('');
              avisar.sucesso(t('proposta'));
            },
          },
        );
      }}
    >
      <h3 className="font-semibold">{t('nova')}</h3>
      <AlertaFormulario erro={propor.error} seNaoAutorizado="credenciaisInvalidas" />
      <Campo
        rotulo={t('codigo')}
        ajuda={t('codigoAjuda')}
        obrigatorio
        value={codigo}
        onChange={(e) => {
          setCodigo(e.target.value);
        }}
      />
      <Selecao rotulo={t('ato')} obrigatorio opcoes={opcoes} valor={tipoAto} aoMudar={setTipoAto} />
      <EnvoltorioCampo rotulo={t('padroes')} obrigatorio>
        {({ id, descricao, invalido }) => (
          <textarea
            id={id}
            aria-describedby={descricao}
            aria-invalid={invalido}
            rows={3}
            spellCheck={false}
            className={cn(classesEntrada, 'h-auto py-2 font-mono text-xs')}
            value={padroes}
            onChange={(e) => {
              setPadroes(e.target.value);
            }}
          />
        )}
      </EnvoltorioCampo>
      <Campo
        rotulo={t('confianca')}
        type="number"
        step="0.01"
        min="0"
        max="1"
        value={confianca}
        onChange={(e) => {
          setConfianca(e.target.value);
        }}
      />
      <Botao type="submit" carregando={propor.isPending} className="justify-self-end">
        {t('propor')}
      </Botao>
    </form>
  );
}
