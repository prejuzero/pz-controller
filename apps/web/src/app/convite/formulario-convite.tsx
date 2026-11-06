'use client';

import { Botao, Campo, EstadoCarregando } from '@pz/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { useAceitarConvite, useDescreverConvite } from '../../api/hooks';
import { chaveValidacao } from '../../formularios';
import { tokenDoFragmento, urlEntrar } from '../../rotas';
import { AlertaFormulario } from '../_acesso/alerta-formulario';

interface Campos {
  senha: string;
  confirmacao: string;
}

// Mesmo limite do contrato AceiteDeConvite; a política de senha é conferida pela API.
const MAXIMO_SENHA = 256;

export function FormularioConvite() {
  const t = useTranslations();
  const router = useRouter();
  const descrever = useDescreverConvite();
  const aceitar = useAceitarConvite();
  const [token] = useState(() => tokenDoFragmento(window.location.hash) ?? null);
  const { mutate: descreverConvite } = descrever;
  useEffect(() => {
    // Tira o token da barra de endereços e do histórico; ele segue só na memória da página.
    window.history.replaceState(null, '', window.location.pathname);
    if (token !== null) descreverConvite(token);
  }, [token, descreverConvite]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Campos>();

  if (token === null || descrever.isError) {
    return (
      <p role="alert" className="rounded-md border border-perigo p-3 text-sm">
        {t('convite.invalido')}
      </p>
    );
  }
  if (descrever.data === undefined) return <EstadoCarregando />;
  const convite = descrever.data;

  const enviar = handleSubmit(({ senha }) => {
    aceitar.mutate(
      { token, senha },
      {
        onSuccess: () => {
          router.replace(urlEntrar('/', 'convite-aceito'));
        },
      },
    );
  });
  const erroCampo = (tipo: string | undefined) => t(`validacao.${chaveValidacao(tipo)}`);

  return (
    <form
      method="post"
      noValidate
      onSubmit={(evento) => void enviar(evento)}
      className="grid gap-4"
    >
      <p className="text-sm">
        {t('convite.para', {
          nome: convite.nome,
          email: convite.email,
          perfil: t(`equipe.perfis.${convite.perfil}`),
        })}
      </p>
      <AlertaFormulario erro={aceitar.error} seNaoAutorizado="linkInvalido" />
      <Campo
        rotulo={t('convite.senha')}
        type="password"
        autoComplete="new-password"
        ajuda={t('redefinirSenha.ajuda')}
        obrigatorio
        erro={errors.senha && erroCampo(errors.senha.type)}
        {...register('senha', { required: true, maxLength: MAXIMO_SENHA })}
      />
      <Campo
        rotulo={t('redefinirSenha.confirmacao')}
        type="password"
        autoComplete="new-password"
        obrigatorio
        erro={errors.confirmacao && erroCampo(errors.confirmacao.type)}
        {...register('confirmacao', {
          validate: { confirmacao: (valor, campos) => valor === campos.senha },
        })}
      />
      <p className="text-sm text-texto-suave">{t('convite.segundoFator')}</p>
      <Botao type="submit" carregando={aceitar.isPending || aceitar.isSuccess}>
        {t('convite.aceitar')}
      </Botao>
    </form>
  );
}
