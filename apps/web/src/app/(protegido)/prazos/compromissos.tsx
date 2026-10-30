'use client';

import { avisar, Botao, Campo, Dialogo, EstadoCarregando, EstadoVazio } from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  useAgendarCompromisso,
  useCancelarCompromisso,
  useCompromissos,
  usePermissao,
} from '../../../api/hooks';
import { formatarInstante, instanteDaDataHora } from '../../../i18n/formatar';

import type { Compromisso } from '@pz/contracts';

const TRINTA_DIAS_MS = 30 * 24 * 3600 * 1000;

/** Próximos compromissos do escritório (HU25): audiências e reuniões com lembretes. */
export function Compromissos() {
  const t = useTranslations('prazos.compromissos');
  // A janela da consulta parte do relógio do aparelho: é filtro de tela, não registro.
  const [periodo] = useState(() => {
    const agora = Date.now();
    return {
      de: new Date(agora).toISOString(),
      ate: new Date(agora + TRINTA_DIAS_MS).toISOString(),
    };
  });
  const compromissos = useCompromissos(periodo.de, periodo.ate);
  const podeAgendar = usePermissao('prazos:confirmar') === true;

  return (
    <section className="space-y-3" aria-labelledby="compromissos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="compromissos" className="text-lg font-semibold">
          {t('titulo')}
        </h2>
        {podeAgendar ? <NovoCompromisso /> : null}
      </div>
      {compromissos.data === undefined ? (
        <EstadoCarregando />
      ) : compromissos.data.itens.length === 0 ? (
        <EstadoVazio descricao={t('vazio')} />
      ) : (
        <ul className="divide-y divide-borda rounded-lg border border-borda">
          {compromissos.data.itens.map((c) => (
            <Item key={c.id} compromisso={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Item({ compromisso: c }: { compromisso: Compromisso }) {
  const podeCancelar = usePermissao('prazos:ajustar') === true;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-3">
      <div>
        <p className="font-medium">{c.titulo}</p>
        <p className="text-sm text-texto-suave">
          {formatarInstante(c.dataHora)}
          {c.local === null ? '' : ` · ${c.local}`}
        </p>
      </div>
      {podeCancelar ? <CancelarCompromisso id={c.id} /> : null}
    </li>
  );
}

function NovoCompromisso() {
  const t = useTranslations('prazos.compromissos');
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [local, setLocal] = useState('');
  const agendar = useAgendarCompromisso();
  const valido = titulo.trim() !== '' && data !== '' && hora !== '';
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('novo')}</Botao>}
      titulo={t('novo')}
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!valido) return;
          agendar.mutate(
            {
              titulo: titulo.trim(),
              dataHora: instanteDaDataHora(data, hora),
              ...(local.trim() === '' ? {} : { local: local.trim() }),
            },
            {
              onSuccess: () => {
                setAberto(false);
                avisar.sucesso(t('agendado'));
              },
            },
          );
        }}
      >
        <Campo
          rotulo={t('nome')}
          obrigatorio
          value={titulo}
          onChange={(evento) => {
            setTitulo(evento.target.value);
          }}
        />
        <Campo
          rotulo={t('data')}
          obrigatorio
          type="date"
          value={data}
          onChange={(evento) => {
            setData(evento.target.value);
          }}
        />
        <Campo
          rotulo={t('hora')}
          obrigatorio
          type="time"
          value={hora}
          onChange={(evento) => {
            setHora(evento.target.value);
          }}
        />
        <Campo
          rotulo={t('local')}
          value={local}
          onChange={(evento) => {
            setLocal(evento.target.value);
          }}
        />
        <p className="text-sm text-texto-suave">{t('lembretes')}</p>
        <Botao type="submit" disabled={!valido} carregando={agendar.isPending}>
          {t('salvar')}
        </Botao>
      </form>
    </Dialogo>
  );
}

function CancelarCompromisso({ id }: { id: string }) {
  const t = useTranslations('prazos.compromissos');
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const cancelar = useCancelarCompromisso();
  const valido = motivo.trim().length >= 10;
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('cancelar')}</Botao>}
      titulo={t('cancelar')}
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!valido) return;
          cancelar.mutate(
            { id, motivo: motivo.trim() },
            {
              onSuccess: () => {
                setAberto(false);
                avisar.sucesso(t('cancelado'));
              },
            },
          );
        }}
      >
        <Campo
          rotulo={t('motivo')}
          obrigatorio
          value={motivo}
          onChange={(evento) => {
            setMotivo(evento.target.value);
          }}
        />
        <Botao type="submit" disabled={!valido} carregando={cancelar.isPending}>
          {t('cancelar')}
        </Botao>
      </form>
    </Dialogo>
  );
}
