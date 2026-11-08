'use client';

import {
  avisar,
  Botao,
  Campo,
  Dialogo,
  EstadoCarregando,
  EstadoVazio,
  FecharDialogo,
} from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  useAdicionarNomeMonitorado,
  useNomesMonitorados,
  useRemoverNomeMonitorado,
} from '../../../../api/hooks';
import { formatarInstante } from '../../../../i18n/formatar';
import { AlertaFormulario } from '../../../_acesso/alerta-formulario';

import type { NomeMonitorado } from '@pz/contracts';

// Mesmos limites da API (HU42): até 5 nomes, de 5 a 150 caracteres.
const MAXIMO_DE_NOMES = 5;
const TAMANHO_MINIMO = 5;
const TAMANHO_MAXIMO = 150;

/**
 * Configurações > Nomes monitorados (HU42, RF05): a captura também busca publicações pelo nome
 * do escritório. O que chegar só pelo nome pode ser homônimo e espera conferência em Publicações.
 */
export function NomesMonitorados() {
  const t = useTranslations('nomesMonitorados');
  const nomes = useNomesMonitorados();
  const itens = nomes.data?.itens ?? [];
  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="text-texto-suave">{t('descricao')}</p>
      </div>
      {nomes.data === undefined ? (
        <EstadoCarregando />
      ) : itens.length === 0 ? (
        <EstadoVazio descricao={t('vazio')} />
      ) : (
        <ul className="divide-y divide-borda rounded-md border border-borda">
          {itens.map((nome) => (
            <li key={nome.id} className="flex items-center justify-between gap-3 p-3">
              <span>
                <span className="block font-medium">{nome.nome}</span>
                <span className="block text-xs text-texto-suave">
                  {t('desde', { quando: formatarInstante(nome.criadoEm) })}
                </span>
              </span>
              <RemoverNome nome={nome} />
            </li>
          ))}
        </ul>
      )}
      {nomes.data === undefined || itens.length >= MAXIMO_DE_NOMES ? (
        nomes.data === undefined ? null : (
          <p className="text-sm text-texto-suave">{t('limite', { maximo: MAXIMO_DE_NOMES })}</p>
        )
      ) : (
        <NovoNome />
      )}
    </div>
  );
}

function NovoNome() {
  const t = useTranslations('nomesMonitorados');
  const adicionar = useAdicionarNomeMonitorado();
  const [nome, setNome] = useState('');
  const curto = nome.trim().length < TAMANHO_MINIMO;
  return (
    <form
      method="post"
      noValidate
      className="grid gap-3 rounded-md border border-borda p-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (curto) return;
        adicionar.mutate(nome.trim(), {
          onSuccess: () => {
            setNome('');
            avisar.sucesso(t('adicionado'));
          },
        });
      }}
    >
      <AlertaFormulario erro={adicionar.error} seNaoAutorizado="credenciaisInvalidas" />
      <Campo
        rotulo={t('nome')}
        ajuda={t('nomeAjuda')}
        obrigatorio
        maxLength={TAMANHO_MAXIMO}
        value={nome}
        onChange={(e) => {
          setNome(e.target.value);
        }}
      />
      <Botao
        type="submit"
        disabled={curto}
        carregando={adicionar.isPending}
        className="justify-self-end"
      >
        {t('adicionar')}
      </Botao>
    </form>
  );
}

function RemoverNome({ nome }: { nome: NomeMonitorado }) {
  const t = useTranslations('nomesMonitorados');
  const remover = useRemoverNomeMonitorado();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('remover')}</Botao>}
      titulo={t('removerTitulo', { nome: nome.nome })}
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
              remover.mutate(nome.id, {
                onSuccess: () => {
                  setAberto(false);
                  avisar.sucesso(t('removido'));
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
