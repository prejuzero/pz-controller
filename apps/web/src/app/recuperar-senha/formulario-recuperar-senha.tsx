'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PedidoDeRedefinicaoDeSenha } from '@pz/contracts';
import { Botao, Campo } from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';

import { useSolicitarRedefinicao } from '../../api/hooks';
import { chaveValidacao } from '../../formularios';
import { ROTA_ENTRAR } from '../../rotas';
import { AlertaFormulario } from '../_acesso/alerta-formulario';

export function FormularioRecuperarSenha() {
  const t = useTranslations();
  const solicitar = useSolicitarRedefinicao();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>({ resolver: zodResolver(PedidoDeRedefinicaoDeSenha.esquema) });
  const enviar = handleSubmit((pedido) => {
    solicitar.mutate(pedido);
  });

  return (
    <div className="grid gap-4">
      {solicitar.isSuccess ? (
        // A API responde igual exista ou não a conta; a tela também (não revela contas).
        <p role="status" className="rounded-md border border-borda p-3 text-sm">
          {t('recuperarSenha.enviado')}
        </p>
      ) : (
        <form noValidate onSubmit={(evento) => void enviar(evento)} className="grid gap-4">
          <AlertaFormulario erro={solicitar.error} seNaoAutorizado="credenciaisInvalidas" />
          <Campo
            rotulo={t('recuperarSenha.email')}
            type="email"
            autoComplete="username"
            inputMode="email"
            obrigatorio
            erro={errors.email && t(`validacao.${chaveValidacao(errors.email.type)}`)}
            {...register('email')}
          />
          <Botao type="submit" carregando={solicitar.isPending}>
            {t('recuperarSenha.enviar')}
          </Botao>
        </form>
      )}
      <Link
        href={ROTA_ENTRAR}
        className="justify-self-center text-sm text-texto underline underline-offset-4"
      >
        {t('recuperarSenha.voltar')}
      </Link>
    </div>
  );
}
