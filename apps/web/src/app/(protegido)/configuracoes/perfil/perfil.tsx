'use client';

import {
  avisar,
  Botao,
  Campo,
  classesEntrada,
  cn,
  EnvoltorioCampo,
  EstadoCarregando,
} from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';

import { useAtualizarPerfil, usePerfil } from '../../../../api/hooks';
import { chaveValidacao } from '../../../../formularios';
import { mascararCelular } from '../../../../mascaras';
import { AlertaFormulario } from '../../../_acesso/alerta-formulario';

import type { PerfilDoAdvogado } from '@pz/contracts';

interface Campos {
  nome: string;
  celular: string;
  emails: string;
}

/** Configurações > Perfil (HU11): nome, celular e e-mails em cópia. O CPF não muda. */
export function Perfil() {
  const t = useTranslations('perfil');
  const perfil = usePerfil();
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
      {perfil.data === undefined ? <EstadoCarregando /> : <FormularioPerfil perfil={perfil.data} />}
    </div>
  );
}

function FormularioPerfil({ perfil }: { perfil: PerfilDoAdvogado }) {
  const t = useTranslations();
  const atualizar = useAtualizarPerfil();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Campos>({
    defaultValues: {
      nome: perfil.nome,
      celular: mascararCelular(perfil.celular),
      emails: perfil.emailsAdicionais.join('\n'),
    },
  });
  const erro = (campo: keyof Campos) => {
    const e = errors[campo];
    return e && t(`validacao.${chaveValidacao(e.type)}`);
  };
  const enviar = handleSubmit(({ nome, celular, emails }) => {
    atualizar.mutate(
      {
        nome: nome.trim(),
        celular,
        emailsAdicionais: emails
          .split(/\s+/)
          .map((email) => email.trim())
          .filter((email) => email !== ''),
      },
      {
        onSuccess: () => {
          avisar.sucesso(t('perfil.salvo'));
        },
      },
    );
  });
  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="grid gap-4">
      <AlertaFormulario erro={atualizar.error} seNaoAutorizado="credenciaisInvalidas" />
      <Campo rotulo={t('perfil.cpf')} value={perfil.cpf} readOnly />
      <Campo
        rotulo={t('perfil.nome')}
        autoComplete="name"
        obrigatorio
        erro={erro('nome')}
        {...register('nome', { required: true, minLength: 3, maxLength: 200 })}
      />
      <Campo
        rotulo={t('perfil.celular')}
        type="tel"
        inputMode="tel"
        obrigatorio
        erro={erro('celular')}
        {...register('celular', {
          required: true,
          pattern: /^\(\d{2}\) \d{5}-\d{4}$/,
          onChange: (e: { target: { value: string } }) => {
            setValue('celular', mascararCelular(e.target.value));
          },
        })}
      />
      <EnvoltorioCampo rotulo={t('perfil.emailsAdicionais')} ajuda={t('perfil.ajudaEmails')}>
        {({ id, descricao }) => (
          <textarea
            id={id}
            aria-describedby={descricao}
            rows={3}
            className={cn(classesEntrada, 'h-auto py-2')}
            {...register('emails')}
          />
        )}
      </EnvoltorioCampo>
      <Botao type="submit" carregando={atualizar.isPending} className="justify-self-end">
        {t('perfil.salvar')}
      </Botao>
    </form>
  );
}
