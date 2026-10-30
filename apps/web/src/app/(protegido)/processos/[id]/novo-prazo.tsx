'use client';

import { avisar, Botao, Campo, Dialogo, Selecao } from '@pz/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useAtosDaTaxonomia, useCadastrarPrazo, useSimularNovoPrazo } from '../../../../api/hooks';
import { formatarDataCivil } from '../../../../i18n/formatar';

import type { PrazoManual } from '../../../../api/prazos';

const RAMOS = ['civel', 'juizados', 'trabalhista', 'penal', 'juizado-criminal'] as const;
const MEIOS = ['djen', 'portal', 'manual'] as const;
const ORIGENS = ['painel', 'manual', 'djen'] as const;

/**
 * Cadastro manual de prazo (HU25): o advogado informa o ato e a referência, vê a data que o motor
 * calcula e pode confirmá-la ao salvar. O navegador não calcula datas.
 */
export function NovoPrazo({ processoId }: { processoId: string }) {
  const t = useTranslations('prazos.novo');
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao>{t('botao')}</Botao>}
      titulo={t('titulo')}
      descricao={t('descricao')}
    >
      {aberto ? (
        <Formulario
          processoId={processoId}
          aoSalvar={() => {
            setAberto(false);
          }}
        />
      ) : null}
    </Dialogo>
  );
}

function Formulario({ processoId, aoSalvar }: { processoId: string; aoSalvar: () => void }) {
  const t = useTranslations('prazos.novo');
  const router = useRouter();
  const atos = useAtosDaTaxonomia();
  const simular = useSimularNovoPrazo();
  const cadastrar = useCadastrarPrazo();
  const [tipoAto, setTipoAto] = useState('');
  const [ramo, setRamo] = useState<string>('civel');
  const [dias, setDias] = useState('');
  const [meio, setMeio] = useState<string>('djen');
  const [data, setData] = useState('');
  const [origem, setOrigem] = useState<string>('painel');
  const [observacao, setObservacao] = useState('');
  const [confirmo, setConfirmo] = useState(false);

  const pedido = (): PrazoManual => ({
    processoId,
    tipoAto,
    ramo: ramo as NonNullable<PrazoManual['ramo']>,
    meio: meio as PrazoManual['meio'],
    dataDeReferencia: data,
    origem: origem as PrazoManual['origem'],
    ...(dias === '' ? {} : { dias: Number(dias) }),
    ...(observacao.trim() === '' ? {} : { observacao: observacao.trim() }),
  });
  const completo = tipoAto !== '' && data !== '';
  const previa = simular.data;
  const vencimento = previa?.vencimento ?? null;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!completo) return;
        cadastrar.mutate(
          {
            ...pedido(),
            ...(confirmo && vencimento !== null ? { vencimentoConfirmado: vencimento } : {}),
          },
          {
            onSuccess: (prazo) => {
              aoSalvar();
              avisar.sucesso(t('salvo'));
              router.push(`/prazos/${prazo.id}`);
            },
          },
        );
      }}
    >
      <Selecao
        rotulo={t('ato')}
        obrigatorio
        opcoes={(atos.data?.itens ?? []).map((a) => ({ valor: a.codigo, rotulo: a.nome }))}
        valor={tipoAto}
        aoMudar={(valor) => {
          setTipoAto(valor);
          simular.reset();
        }}
      />
      <Selecao
        rotulo={t('ramo')}
        opcoes={RAMOS.map((valor) => ({ valor, rotulo: t(`ramos.${valor}`) }))}
        valor={ramo}
        aoMudar={(valor) => {
          setRamo(valor);
          simular.reset();
        }}
      />
      <Selecao
        rotulo={t('meio')}
        opcoes={MEIOS.map((valor) => ({ valor, rotulo: t(`meios.${valor}`) }))}
        valor={meio}
        aoMudar={(valor) => {
          setMeio(valor);
          simular.reset();
        }}
      />
      <Campo
        rotulo={t('dataDeReferencia')}
        obrigatorio
        type="date"
        value={data}
        onChange={(evento) => {
          setData(evento.target.value);
          simular.reset();
        }}
      />
      <Campo
        rotulo={t('dias')}
        type="number"
        min={1}
        value={dias}
        onChange={(evento) => {
          setDias(evento.target.value);
          simular.reset();
        }}
      />
      <Selecao
        rotulo={t('origem')}
        opcoes={ORIGENS.map((valor) => ({ valor, rotulo: t(`origens.${valor}`) }))}
        valor={origem}
        aoMudar={setOrigem}
      />
      <Campo
        rotulo={t('observacao')}
        value={observacao}
        onChange={(evento) => {
          setObservacao(evento.target.value);
        }}
      />
      {previa === undefined ? null : (
        <div role="status" className="space-y-2 rounded-md border border-borda p-3 text-sm">
          <p>
            {vencimento === null
              ? t('previaSemData')
              : t('previaResultado', { vencimento: formatarDataCivil(vencimento) })}
          </p>
          {vencimento === null ? null : (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={confirmo}
                onChange={(evento) => {
                  setConfirmo(evento.target.checked);
                }}
              />
              {t('confirmar')}
            </label>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Botao
          type="button"
          variante="secundaria"
          disabled={!completo}
          carregando={simular.isPending}
          onClick={() => {
            setConfirmo(false);
            simular.mutate(pedido());
          }}
        >
          {t('previa')}
        </Botao>
        <Botao
          type="submit"
          disabled={!completo || previa === undefined}
          carregando={cadastrar.isPending}
        >
          {t('salvar')}
        </Botao>
      </div>
    </form>
  );
}
