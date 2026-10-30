'use client';

import { avisar, Botao, Campo, Dialogo } from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  useAjustarPrazo,
  useCancelarPrazo,
  useConfirmarPrazo,
  useCumprirPrazo,
  usePermissao,
  useSimularAjuste,
} from '../../../../api/hooks';
import { formatarDataCivil } from '../../../../i18n/formatar';

import type { Ajuste } from '../../../../api/prazos';
import type { DetalheDoPrazo } from '@pz/contracts';

const MOTIVO_MINIMO = 10;

/** Ações do advogado no prazo (HU24). Toda decisão é dele; a data nova vem sempre da API. */
export function AcoesDoPrazo({ prazo }: { prazo: DetalheDoPrazo }) {
  const t = useTranslations('prazos.acoes');
  const podeConfirmar = usePermissao('prazos:confirmar') === true;
  const podeAjustar = usePermissao('prazos:ajustar') === true;
  const confirmar = useConfirmarPrazo();
  const cumprir = useCumprirPrazo();
  const alvo = { id: prazo.id, versao: prazo.versao };
  const aberto = prazo.status === 'a-confirmar' || prazo.status === 'pendente';
  if (!aberto) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {podeConfirmar && prazo.status === 'a-confirmar' && prazo.vencimento !== null ? (
        <Botao
          carregando={confirmar.isPending}
          onClick={() => {
            confirmar.mutate(alvo, { onSuccess: () => avisar.sucesso(t('confirmado')) });
          }}
        >
          {t('confirmar')}
        </Botao>
      ) : null}
      {podeConfirmar && prazo.status === 'pendente' ? (
        <Botao
          carregando={cumprir.isPending}
          onClick={() => {
            cumprir.mutate(alvo, { onSuccess: () => avisar.sucesso(t('cumprido')) });
          }}
        >
          {t('cumprir')}
        </Botao>
      ) : null}
      {podeAjustar ? <Ajustar prazo={prazo} /> : null}
      {podeAjustar ? <Cancelar prazo={prazo} /> : null}
    </div>
  );
}

function Ajustar({ prazo }: { prazo: DetalheDoPrazo }) {
  const t = useTranslations('prazos.acoes');
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [dias, setDias] = useState('');
  const [vencimento, setVencimento] = useState('');
  const ajustar = useAjustarPrazo();
  const simular = useSimularAjuste();
  const pedido = (): Ajuste & { id: string } => ({
    id: prazo.id,
    versao: prazo.versao,
    motivo: motivo.trim(),
    ...(dias === '' ? {} : { dias: Number(dias) }),
    ...(vencimento === '' ? {} : { vencimento }),
  });
  const valido = motivo.trim().length >= MOTIVO_MINIMO && (dias !== '' || vencimento !== '');
  const previa = simular.data;

  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('ajustar')}</Botao>}
      titulo={t('ajustar')}
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!valido) return;
          ajustar.mutate(pedido(), {
            onSuccess: () => {
              setAberto(false);
              avisar.sucesso(t('ajustado'));
            },
          });
        }}
      >
        <Campo
          rotulo={t('motivo')}
          obrigatorio
          ajuda={t('motivoAjuda')}
          value={motivo}
          onChange={(evento) => {
            setMotivo(evento.target.value);
          }}
        />
        <Campo
          rotulo={t('dias')}
          type="number"
          min={1}
          value={dias}
          onChange={(evento) => {
            setDias(evento.target.value);
          }}
        />
        <Campo
          rotulo={t('vencimento')}
          type="date"
          ajuda={t('vencimentoAjuda')}
          value={vencimento}
          onChange={(evento) => {
            setVencimento(evento.target.value);
          }}
        />
        {previa === undefined ? null : (
          <p role="status" className="text-sm">
            {previa.vencimento === null
              ? t('previaSemData')
              : t('previaResultado', { vencimento: formatarDataCivil(previa.vencimento) })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Botao
            type="button"
            variante="secundaria"
            disabled={!valido}
            carregando={simular.isPending}
            onClick={() => {
              simular.mutate(pedido());
            }}
          >
            {t('previa')}
          </Botao>
          <Botao type="submit" disabled={!valido} carregando={ajustar.isPending}>
            {t('salvar')}
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}

function Cancelar({ prazo }: { prazo: DetalheDoPrazo }) {
  const t = useTranslations('prazos.acoes');
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const cancelar = useCancelarPrazo();
  const valido = motivo.trim().length >= MOTIVO_MINIMO;
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
            { id: prazo.id, versao: prazo.versao, motivo: motivo.trim() },
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
          ajuda={t('motivoAjuda')}
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
