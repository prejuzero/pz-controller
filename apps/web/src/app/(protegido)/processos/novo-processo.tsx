'use client';

import { avisar, Botao, Campo, Dialogo } from '@pz/ui';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useCadastrarProcesso } from '../../../api/hooks';
import { detectarCnj, mascararCnj, situacaoCnj } from '../../../cnj';

import { CaixaSigilo, CampoCliente } from './comum';

/** Cadastro de processo pelo número CNJ (RF03); o tribunal é deduzido do número. */
export function NovoProcesso() {
  const t = useTranslations('processos');
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={
        <Botao>
          <Plus className="size-4" aria-hidden />
          {t('novo')}
        </Botao>
      }
      titulo={t('novo')}
    >
      {aberto ? (
        <FormularioProcesso
          aoCadastrar={() => {
            setAberto(false);
          }}
        />
      ) : null}
    </Dialogo>
  );
}

function FormularioProcesso({ aoCadastrar }: { aoCadastrar: () => void }) {
  const t = useTranslations('processos');
  const router = useRouter();
  const cadastrar = useCadastrarProcesso();
  const [numero, setNumero] = useState('');
  const [orgao, setOrgao] = useState('');
  const [comarca, setComarca] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [sigiloso, setSigiloso] = useState(false);
  const situacao = situacaoCnj(numero);

  const ajuda =
    situacao.tipo === 'valido'
      ? t('numeroValido', { tribunal: situacao.tribunal ?? t('semTribunal') })
      : t('numeroAjuda');

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (situacao.tipo !== 'valido') return;
        cadastrar.mutate(
          {
            numeroCnj: situacao.formatado,
            orgao: orgao.trim() === '' ? undefined : orgao.trim(),
            comarca: comarca.trim() === '' ? undefined : comarca.trim(),
            clienteId: clienteId ?? undefined,
            sigiloso,
          },
          {
            onSuccess: (processo) => {
              aoCadastrar();
              avisar.sucesso(t('cadastrado'));
              router.push(`/processos/${processo.id}`);
            },
          },
        );
      }}
    >
      <Campo
        rotulo={t('numeroCnj')}
        obrigatorio
        inputMode="numeric"
        autoComplete="off"
        placeholder="0000000-00.0000.0.00.0000"
        value={numero}
        ajuda={ajuda}
        erro={situacao.tipo === 'invalido' ? t('numeroInvalido') : undefined}
        onPaste={(evento) => {
          const detectado = detectarCnj(evento.clipboardData.getData('text'));
          if (detectado === undefined) return;
          evento.preventDefault();
          setNumero(detectado);
        }}
        onChange={(evento) => {
          setNumero(mascararCnj(evento.target.value));
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      <CampoCliente valor={clienteId} aoMudar={setClienteId} />
      <CaixaSigilo marcado={sigiloso} aoMudar={setSigiloso} />
      <Botao
        type="submit"
        carregando={cadastrar.isPending}
        disabled={situacao.tipo !== 'valido'}
        className="justify-self-end"
      >
        {t('cadastrar')}
      </Botao>
    </form>
  );
}
