'use client';

import {
  avisar,
  Botao,
  Campo,
  Dialogo,
  EstadoCarregando,
  EstadoVazio,
  FecharDialogo,
  Selecao,
  SeloStatus,
} from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useAdicionarOab, usePerfil, useRemoverOab } from '../../../../api/hooks';
import { OPCOES_UF } from '../../../../ufs';
import { AlertaFormulario } from '../../../_acesso/alerta-formulario';

import type { OabDoAdvogado } from '@pz/contracts';

/** Configurações > OABs (HU11): as ativas são monitoradas; a principal não sai. */
export function Oabs() {
  const t = useTranslations('oabs');
  const perfil = usePerfil();
  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="text-texto-suave">{t('descricao')}</p>
      </div>
      {perfil.data === undefined ? (
        <EstadoCarregando />
      ) : perfil.data.oabs.length === 0 ? (
        <EstadoVazio descricao={t('vazio')} />
      ) : (
        <ul className="divide-y divide-borda rounded-md border border-borda">
          {perfil.data.oabs.map((oab) => (
            <li key={oab.id} className="flex items-center justify-between gap-3 p-3">
              <span className="flex items-center gap-2">
                <span className="font-medium">
                  {oab.numero}/{oab.uf}
                </span>
                <SeloStatus tom={oab.tipo === 'principal' ? 'info' : 'neutro'}>
                  {t(oab.tipo)}
                </SeloStatus>
              </span>
              {oab.tipo === 'suplementar' ? <RemoverOab oab={oab} /> : null}
            </li>
          ))}
        </ul>
      )}
      <NovaOab />
    </div>
  );
}

function NovaOab() {
  const t = useTranslations();
  const adicionar = useAdicionarOab();
  const [numero, setNumero] = useState('');
  const [uf, setUf] = useState<string | undefined>(undefined);
  return (
    <form
      noValidate
      className="grid gap-3 rounded-md border border-borda p-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (numero.trim() === '' || uf === undefined) return;
        adicionar.mutate(
          { numero: numero.trim(), uf },
          {
            onSuccess: () => {
              setNumero('');
              avisar.sucesso(t('oabs.adicionada'));
            },
          },
        );
      }}
    >
      <AlertaFormulario erro={adicionar.error} seNaoAutorizado="credenciaisInvalidas" />
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Campo
          rotulo={t('cadastro.numero')}
          inputMode="numeric"
          obrigatorio
          maxLength={20}
          value={numero}
          onChange={(e) => {
            setNumero(e.target.value);
          }}
        />
        <Selecao
          rotulo={t('cadastro.uf')}
          obrigatorio
          opcoes={OPCOES_UF}
          valor={uf}
          aoMudar={setUf}
        />
      </div>
      <Botao type="submit" carregando={adicionar.isPending} className="justify-self-end">
        {t('oabs.adicionar')}
      </Botao>
    </form>
  );
}

function RemoverOab({ oab }: { oab: OabDoAdvogado }) {
  const t = useTranslations('oabs');
  const remover = useRemoverOab();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('remover')}</Botao>}
      titulo={t('removerTitulo', { oab: `${oab.numero}/${oab.uf}` })}
      descricao={t('removerDescricao')}
      acoes={
        <>
          <FecharDialogo asChild>
            <Botao variante="secundaria">{t('cancelar')}</Botao>
          </FecharDialogo>
          <Botao
            variante="perigo"
            carregando={remover.isPending}
            onClick={() => {
              remover.mutate(oab.id, {
                onSuccess: () => {
                  setAberto(false);
                  avisar.sucesso(t('removida'));
                },
              });
            }}
          >
            {t('remover')}
          </Botao>
        </>
      }
    />
  );
}
