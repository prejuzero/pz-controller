'use client';

import {
  avisar,
  Botao,
  Campo,
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
  useAprovarRamoDaClasse,
  useProporRamoDaClasse,
  useRamosDasClasses,
} from '../../../api/hooks';
import { AlertaFormulario } from '../../_acesso/alerta-formulario';

import type { RamosDasClasses as ListaDeClasses } from '@pz/contracts';

type Classe = ListaDeClasses['itens'][number];
const RAMOS = ['civel', 'juizados', 'trabalhista', 'penal', 'juizado-criminal'] as const;

/**
 * Ramo pela classe processual do DJEN (14/11/2026): o DJEN informa a classe, não o rito. A
 * curadoria indica o ramo de cada classe, com o fundamento, e aprova; os prazos do DJEN ainda sem
 * data são refeitos na API. A regra é do módulo prazos.
 */
export function RamosDasClasses() {
  const t = useTranslations('ramosDasClasses');
  const tr = useTranslations('ramosDasClasses.ramos');
  const classes = useRamosDasClasses();
  const aprovar = useAprovarRamoDaClasse();
  const [escolhida, setEscolhida] = useState('');

  const colunas: ColunaTabela<Classe>[] = [
    { accessorKey: 'classe', header: t('colunas.classe') },
    { accessorKey: 'ocorrencias', header: t('colunas.ocorrencias') },
    {
      id: 'aprovada',
      header: t('colunas.aprovada'),
      cell: ({ row }) => {
        const a = row.original.aprovada;
        return a === null ? (
          <SeloStatus tom="alerta">{t('semRamo')}</SeloStatus>
        ) : (
          <span>
            <SeloStatus tom="sucesso">{tr(a.ramo)}</SeloStatus>{' '}
            <span className="text-xs text-texto-suave">{a.fundamento}</span>
          </span>
        );
      },
    },
    {
      id: 'acoes',
      header: t('colunas.acoes'),
      cell: ({ row }) => {
        const r = row.original.rascunho;
        if (r !== null) {
          return (
            <Botao
              variante="secundaria"
              carregando={aprovar.isPending}
              aria-label={t('aprovarDaClasse', { ramo: tr(r.ramo), classe: row.original.classe })}
              onClick={() => {
                aprovar.mutate(r.id, { onSuccess: () => avisar.sucesso(t('aprovado')) });
              }}
            >
              {t('aprovar', { ramo: tr(r.ramo) })}
            </Botao>
          );
        }
        return (
          <Botao
            variante="fantasma"
            aria-label={t('indicarDaClasse', { classe: row.original.classe })}
            onClick={() => {
              setEscolhida(row.original.classe);
            }}
          >
            {t('indicar')}
          </Botao>
        );
      },
    },
  ];

  return (
    <section className="space-y-4" aria-labelledby="ramos-das-classes">
      <div className="space-y-2">
        <h2 id="ramos-das-classes" className="text-xl font-semibold">
          {t('titulo')}
        </h2>
        <p className="max-w-3xl text-sm text-texto-suave">{t('descricao')}</p>
      </div>
      <AlertaFormulario erro={aprovar.error} seNaoAutorizado="credenciaisInvalidas" />
      {classes.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <TabelaDados
          titulo={t('titulo')}
          colunas={colunas}
          dados={classes.data.itens}
          idLinha={(c) => c.classe}
          vazio={<EstadoVazio descricao={t('vazio')} />}
        />
      )}
      <NovoRamo key={escolhida} classeInicial={escolhida} />
    </section>
  );
}

function NovoRamo({ classeInicial }: { classeInicial: string }) {
  const t = useTranslations('ramosDasClasses');
  const tr = useTranslations('ramosDasClasses.ramos');
  const propor = useProporRamoDaClasse();
  const [classe, setClasse] = useState(classeInicial);
  const [ramo, setRamo] = useState<string | undefined>(undefined);
  const [fundamento, setFundamento] = useState('');
  const [fonteUrl, setFonteUrl] = useState('');
  return (
    <form
      method="post"
      noValidate
      className="grid max-w-xl gap-3 rounded-md border border-borda p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const escolhido = RAMOS.find((r) => r === ramo);
        if (escolhido === undefined) return;
        propor.mutate(
          {
            classe: classe.trim(),
            ramo: escolhido,
            fundamento: fundamento.trim(),
            fonteUrl: fonteUrl.trim(),
          },
          { onSuccess: () => avisar.sucesso(t('proposto')) },
        );
      }}
    >
      <h3 className="font-semibold">{t('novo')}</h3>
      <AlertaFormulario erro={propor.error} seNaoAutorizado="credenciaisInvalidas" />
      <Campo
        rotulo={t('classe')}
        obrigatorio
        value={classe}
        onChange={(e) => {
          setClasse(e.target.value);
        }}
      />
      <Selecao
        rotulo={t('ramo')}
        obrigatorio
        opcoes={RAMOS.map((r) => ({ valor: r, rotulo: tr(r) }))}
        valor={ramo}
        aoMudar={setRamo}
      />
      <Campo
        rotulo={t('fundamento')}
        ajuda={t('fundamentoAjuda')}
        obrigatorio
        value={fundamento}
        onChange={(e) => {
          setFundamento(e.target.value);
        }}
      />
      <Campo
        rotulo={t('fonteUrl')}
        type="url"
        obrigatorio
        value={fonteUrl}
        onChange={(e) => {
          setFonteUrl(e.target.value);
        }}
      />
      <div>
        <Botao type="submit" carregando={propor.isPending}>
          {t('propor')}
        </Botao>
      </div>
    </form>
  );
}
