'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Credenciais } from '@pz/contracts';
import { Botao, Campo } from '@pz/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';

import { useEntrar } from '../../api/hooks';
import { chaveValidacao } from '../../formularios';
import { destinoAposEntrar, ROTA_RECUPERAR_SENHA } from '../../rotas';
import { AlertaFormulario } from '../_acesso/alerta-formulario';

export function FormularioEntrar({ retorno }: { retorno: string | undefined }) {
  const t = useTranslations();
  const router = useRouter();
  const entrar = useEntrar();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Credenciais>({ resolver: zodResolver(Credenciais.esquema) });

  const enviar = handleSubmit((credenciais) => {
    entrar.mutate(credenciais, {
      onSuccess: (sessao) => {
        router.replace(destinoAposEntrar(sessao.proximoPasso, retorno));
      },
    });
  });

  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="grid gap-4">
      <AlertaFormulario erro={entrar.error} seNaoAutorizado="credenciaisInvalidas" />
      <Campo
        rotulo={t('entrar.email')}
        type="email"
        autoComplete="username"
        inputMode="email"
        obrigatorio
        erro={errors.email && t(`validacao.${chaveValidacao(errors.email.type)}`)}
        {...register('email')}
      />
      <Campo
        rotulo={t('entrar.senha')}
        type="password"
        autoComplete="current-password"
        obrigatorio
        erro={errors.senha && t(`validacao.${chaveValidacao(errors.senha.type)}`)}
        {...register('senha')}
      />
      <Botao type="submit" carregando={entrar.isPending || entrar.isSuccess}>
        {t('entrar.enviar')}
      </Botao>
      <Link
        href={ROTA_RECUPERAR_SENHA}
        className="justify-self-center text-sm text-texto underline underline-offset-4"
      >
        {t('entrar.esqueciSenha')}
      </Link>
    </form>
  );
}
