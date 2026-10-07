'use client';

import { avisar, Botao, Campo, Dialogo, EstadoCarregando, EstadoVazio, Selecao } from '@pz/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { useAlterarCobertura, useAtualizarProcesso, useProcesso } from '../../../../api/hooks';
import { SePermitido } from '../../_casca/se-permitido';
import {
  CaixaSigilo,
  CampoCliente,
  COBERTURAS,
  SeloCobertura,
  SeloSigilo,
  useNomeDoCliente,
} from '../comum';

import type { Cobertura } from '../../../../api/processos';
import type { ProcessoDoTenant } from '@pz/contracts';

/** Detalhe do processo (HU12): dados, cobertura (RF91) e, nas próximas entregas, publicações e prazos. */
export function DetalheProcesso({ id }: { id: string }) {
  const t = useTranslations('processos');
  const processo = useProcesso(id);
  const nomeDoCliente = useNomeDoCliente();
  if (processo.data === undefined) return <EstadoCarregando />;
  const p = processo.data;

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/processos"
        className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('detalhe.voltar')}
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{p.numeroCnj}</h1>
        <div className="flex flex-wrap gap-2">
          <SeloCobertura cobertura={p.cobertura} />
          {p.sigiloso ? <SeloSigilo /> : null}
        </div>
      </div>

      <Secao
        titulo={t('detalhe.dados')}
        acao={
          <SePermitido permissao="processos:gerir">
            <EditarProcesso processo={p} />
          </SePermitido>
        }
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item rotulo={t('colunas.tribunal')} valor={p.tribunal ?? t('semTribunal')} />
          <Item rotulo={t('detalhe.ramo')} valor={p.ramo ?? '—'} />
          <Item rotulo={t('orgao')} valor={p.orgao ?? '—'} />
          <Item rotulo={t('comarca')} valor={p.comarca ?? '—'} />
          <Item rotulo={t('cliente')} valor={nomeDoCliente(p.clienteId)} />
        </dl>
      </Secao>

      <Secao
        titulo={t('detalhe.cobertura')}
        acao={
          <SePermitido permissao="processos:gerir">
            <AlterarCobertura processo={p} />
          </SePermitido>
        }
      >
        <p className="text-sm">{t(`coberturaAjuda.${p.cobertura}`)}</p>
        {p.motivoCobertura === null ? null : (
          <dl className="mt-3">
            <Item rotulo={t('detalhe.motivo')} valor={p.motivoCobertura} />
          </dl>
        )}
      </Secao>

      <Secao titulo={t('detalhe.publicacoes')}>
        <EstadoVazio descricao={t('detalhe.emBreve')} />
      </Secao>
      <Secao titulo={t('detalhe.prazos')}>
        <EstadoVazio descricao={t('detalhe.emBreve')} />
      </Secao>
    </div>
  );
}

function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-md border border-borda p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-sm text-texto-suave">{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

function EditarProcesso({ processo }: { processo: ProcessoDoTenant }) {
  const t = useTranslations('processos');
  const atualizar = useAtualizarProcesso();
  const [aberto, setAberto] = useState(false);
  const [orgao, setOrgao] = useState(processo.orgao ?? '');
  const [comarca, setComarca] = useState(processo.comarca ?? '');
  const [clienteId, setClienteId] = useState(processo.clienteId);
  const [sigiloso, setSigiloso] = useState(processo.sigiloso);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('detalhe.editar')}</Botao>}
      titulo={t('detalhe.editar')}
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          atualizar.mutate(
            {
              id: processo.id,
              orgao: orgao.trim() === '' ? null : orgao.trim(),
              comarca: comarca.trim() === '' ? null : comarca.trim(),
              clienteId,
              sigiloso,
            },
            {
              onSuccess: () => {
                setAberto(false);
                avisar.sucesso(t('detalhe.salvo'));
              },
            },
          );
        }}
      >
        <Campo
          rotulo={t('orgao')}
          maxLength={200}
          value={orgao}
          onChange={(evento) => {
            setOrgao(evento.target.value);
          }}
        />
        <Campo
          rotulo={t('comarca')}
          maxLength={200}
          value={comarca}
          onChange={(evento) => {
            setComarca(evento.target.value);
          }}
        />
        <CampoCliente valor={clienteId} aoMudar={setClienteId} />
        <CaixaSigilo marcado={sigiloso} aoMudar={setSigiloso} />
        <Botao type="submit" carregando={atualizar.isPending} className="justify-self-end">
          {t('detalhe.salvar')}
        </Botao>
      </form>
    </Dialogo>
  );
}

/** Marcar fora da cobertura automática exige motivo (RF91), registrado na auditoria pela API. */
function AlterarCobertura({ processo }: { processo: ProcessoDoTenant }) {
  const t = useTranslations('processos');
  const alterar = useAlterarCobertura();
  const [aberto, setAberto] = useState(false);
  const [cobertura, setCobertura] = useState<Cobertura>(
    processo.cobertura === 'automatica' ? 'manual' : processo.cobertura,
  );
  const [motivo, setMotivo] = useState(processo.motivoCobertura ?? '');
  const exigeMotivo = cobertura !== 'automatica';
  const motivoValido = !exigeMotivo || motivo.trim().length >= 3;
  const rotulo =
    processo.cobertura === 'automatica' ? t('detalhe.marcarFora') : t('detalhe.alterarCobertura');
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{rotulo}</Botao>}
      titulo={rotulo}
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!motivoValido) return;
          alterar.mutate(
            {
              id: processo.id,
              cobertura,
              motivo: exigeMotivo ? motivo.trim() : null,
            },
            {
              onSuccess: () => {
                setAberto(false);
                avisar.sucesso(t('detalhe.coberturaAlterada'));
              },
            },
          );
        }}
      >
        <Selecao
          rotulo={t('detalhe.cobertura')}
          opcoes={COBERTURAS.map((valor) => ({ valor, rotulo: t(`coberturas.${valor}`) }))}
          valor={cobertura}
          ajuda={t(`coberturaAjuda.${cobertura}`)}
          aoMudar={(valor) => {
            setCobertura(valor as Cobertura);
          }}
        />
        {exigeMotivo ? (
          <Campo
            rotulo={t('detalhe.motivo')}
            obrigatorio
            minLength={3}
            maxLength={500}
            ajuda={t('detalhe.motivoAjuda')}
            value={motivo}
            onChange={(evento) => {
              setMotivo(evento.target.value);
            }}
          />
        ) : null}
        <Botao
          type="submit"
          carregando={alterar.isPending}
          disabled={!motivoValido}
          className="justify-self-end"
        >
          {t('detalhe.salvar')}
        </Botao>
      </form>
    </Dialogo>
  );
}
