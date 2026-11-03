'use client';

import { avisar, Botao, Campo, Dialogo, Selecao } from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { descreverErro } from '../../../api/erros';
import { useEnviarPorEmail, usePermissao } from '../../../api/hooks';

import type { PedidoDeEnvio } from '../../../api/notificacoes';

/** O que vai anexado; formato, destinatários e mensagem vêm do diálogo. */
export type AnexoDoEnvio =
  | { recurso: 'prazo' | 'publicacao' | 'relatorio'; recursoId: string }
  | {
      recurso: 'busca';
      alvo: 'prazos' | 'publicacoes';
      filtros: Extract<PedidoDeEnvio, { recurso: 'busca' }>['filtros'];
    };

const FORMATOS = ['pdf', 'xlsx'] as const;
const SIGILO = 'confirmacao-de-sigilo';

/** Separa por vírgula, ponto e vírgula, espaço ou linha; o servidor valida cada endereço. */
const lerEnderecos = (texto: string) => [
  ...new Set(
    texto
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter((e) => e !== ''),
  ),
];

/**
 * "Enviar por e-mail" (HU32, RF68–RF70): destinatários, mensagem e prévia do anexo. Destinatário
 * de fora do escritório exige a confirmação explícita do sigilo profissional antes de sair.
 * Só com a permissão de exportar (o anexo é uma exportação).
 */
export function EnviarPorEmail({ anexo }: { anexo: AnexoDoEnvio }) {
  const t = useTranslations('envio');
  const permitido = usePermissao('relatorios:exportar');
  const [aberto, setAberto] = useState(false);
  if (permitido !== true) return null;
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={
        <Botao variante="secundaria" tamanho="sm">
          {t('botao')}
        </Botao>
      }
      titulo={t('titulo')}
      descricao={t('descricao')}
    >
      {aberto ? (
        <Formulario
          anexo={anexo}
          aoEnviar={() => {
            setAberto(false);
          }}
        />
      ) : null}
    </Dialogo>
  );
}

function Formulario({ anexo, aoEnviar }: { anexo: AnexoDoEnvio; aoEnviar: () => void }) {
  const t = useTranslations('envio');
  const enviar = useEnviarPorEmail();
  const [destinatarios, setDestinatarios] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [formato, setFormato] = useState<(typeof FORMATOS)[number]>('pdf');
  const [confirmo, setConfirmo] = useState(false);
  const enderecos = lerEnderecos(destinatarios);
  const erro = enviar.error === null ? null : descreverErro(enviar.error);
  const pedeSigilo = erro?.codigo === SIGILO;
  const comFormato = anexo.recurso !== 'relatorio';

  const pedido = (): PedidoDeEnvio =>
    ({
      ...anexo,
      ...(comFormato ? { formato } : {}),
      destinatarios: enderecos,
      ...(mensagem.trim() === '' ? {} : { mensagem: mensagem.trim() }),
      ...(pedeSigilo && confirmo ? { confirmacaoSigilo: true } : {}),
    }) as PedidoDeEnvio;

  return (
    <form
      method="post"
      noValidate
      className="grid gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (enderecos.length === 0 || (pedeSigilo && !confirmo)) return;
        enviar.mutate(pedido(), {
          onSuccess: () => {
            aoEnviar();
            avisar.sucesso(t('enviado'), t('enviadoDescricao'));
          },
        });
      }}
    >
      <Campo
        rotulo={t('destinatarios')}
        ajuda={t('destinatariosAjuda')}
        obrigatorio
        type="text"
        inputMode="email"
        autoComplete="off"
        value={destinatarios}
        onChange={(evento) => {
          setDestinatarios(evento.target.value);
          setConfirmo(false);
          enviar.reset();
        }}
      />
      <label className="grid gap-1.5 text-sm font-medium">
        {t('mensagem')}
        <textarea
          className="min-h-20 rounded-md border border-borda-forte bg-superficie-elevada p-2 text-sm font-normal"
          maxLength={1000}
          value={mensagem}
          onChange={(evento) => {
            setMensagem(evento.target.value);
          }}
        />
      </label>
      {comFormato ? (
        <Selecao
          rotulo={t('formato')}
          opcoes={FORMATOS.map((valor) => ({ valor, rotulo: t(`formatos.${valor}`) }))}
          valor={formato}
          aoMudar={(valor) => {
            setFormato(valor as (typeof FORMATOS)[number]);
          }}
        />
      ) : null}
      <p className="text-sm text-texto-suave">
        {t('previa', {
          arquivo: `prejuzero-${anexo.recurso}.${comFormato ? formato : t('formatoDoRelatorio')}`,
        })}
      </p>
      {pedeSigilo ? (
        <div role="alert" className="space-y-2 rounded-md border border-alerta p-3 text-sm">
          <p className="font-medium">{t('sigiloTitulo')}</p>
          <p>{erro.descricao}</p>
          <p>{t('sigiloTexto')}</p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={confirmo}
              onChange={(evento) => {
                setConfirmo(evento.target.checked);
              }}
            />
            {t('sigiloConfirmo')}
          </label>
        </div>
      ) : erro === null ? null : (
        <p role="alert" className="text-sm text-perigo">
          {erro.descricao}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Botao
          type="submit"
          carregando={enviar.isPending}
          disabled={enderecos.length === 0 || (pedeSigilo && !confirmo)}
        >
          {pedeSigilo ? t('enviarMesmoAssim') : t('enviar')}
        </Botao>
      </div>
    </form>
  );
}
