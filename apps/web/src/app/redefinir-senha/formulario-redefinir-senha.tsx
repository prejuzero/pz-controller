'use client';

import { Botao, Campo } from '@pz/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { useRedefinirSenha } from '../../api/hooks';
import { chaveValidacao } from '../../formularios';
import { ROTA_RECUPERAR_SENHA, tokenDoFragmento, urlEntrar } from '../../rotas';
import { AlertaFormulario } from '../_acesso/alerta-formulario';

interface Campos {
  novaSenha: string;
  confirmacao: string;
}

// Mesmos limites do contrato RedefinicaoDeSenha; a política de senha é conferida pela API.
const MAXIMO_SENHA = 512;

export function FormularioRedefinirSenha() {
  const t = useTranslations();
  const router = useRouter();
  const redefinir = useRedefinirSenha();
  // Só no navegador (ver formulario-redefinir-senha-cliente.tsx): o fragmento não chega ao servidor.
  const [token] = useState(() => tokenDoFragmento(window.location.hash) ?? null);
  useEffect(() => {
    // Tira o token da barra de endereços e do histórico.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Campos>();

  if (token === null) {
    return (
      <div className="grid gap-4">
        <p role="alert" className="rounded-md border border-perigo p-3 text-sm">
          {t('redefinirSenha.semToken')}
        </p>
        <Botao asChild variante="secundaria">
          <Link href={ROTA_RECUPERAR_SENHA}>{t('redefinirSenha.pedirNovo')}</Link>
        </Botao>
      </div>
    );
  }

  const enviar = handleSubmit(({ novaSenha }) => {
    redefinir.mutate(
      { token, novaSenha },
      {
        onSuccess: () => {
          router.replace(urlEntrar('/', 'senha-redefinida'));
        },
      },
    );
  });
  const erroCampo = (tipo: string | undefined) => t(`validacao.${chaveValidacao(tipo)}`);

  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="grid gap-4">
      <AlertaFormulario erro={redefinir.error} seNaoAutorizado="linkInvalido" />
      <Campo
        rotulo={t('redefinirSenha.novaSenha')}
        type="password"
        autoComplete="new-password"
        ajuda={t('redefinirSenha.ajuda')}
        obrigatorio
        erro={errors.novaSenha && erroCampo(errors.novaSenha.type)}
        {...register('novaSenha', {
          required: true,
          maxLength: MAXIMO_SENHA,
        })}
      />
      <Campo
        rotulo={t('redefinirSenha.confirmacao')}
        type="password"
        autoComplete="new-password"
        obrigatorio
        erro={errors.confirmacao && erroCampo(errors.confirmacao.type)}
        {...register('confirmacao', {
          validate: { confirmacao: (valor, campos) => valor === campos.novaSenha },
        })}
      />
      {redefinir.error === null ? null : (
        <Link
          href={ROTA_RECUPERAR_SENHA}
          className="justify-self-center text-sm text-texto underline underline-offset-4"
        >
          {t('redefinirSenha.pedirNovo')}
        </Link>
      )}
      <Botao type="submit" carregando={redefinir.isPending || redefinir.isSuccess}>
        {t('redefinirSenha.enviar')}
      </Botao>
    </form>
  );
}
