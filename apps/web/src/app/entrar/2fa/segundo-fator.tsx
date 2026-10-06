'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CodigoSegundoFator, type ConfiguracaoSegundoFator } from '@pz/contracts';
import { avisar, Botao, Campo, EstadoCarregando } from '@pz/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  useAtivarSegundoFator,
  useConfigurarSegundoFator,
  useSessao,
  useVerificarSegundoFator,
} from '../../../api/hooks';
import { chaveValidacao } from '../../../formularios';
import { destinoAposEntrar, retornoSeguro } from '../../../rotas';
import { AlertaFormulario } from '../../_acesso/alerta-formulario';
import { PaginaAcesso } from '../../_acesso/pagina-acesso';

/**
 * Segundo passo da entrada (HU06): verifica o código ou, no primeiro acesso, configura o 2FA
 * (obrigatório) e mostra os códigos de recuperação uma única vez.
 */
export function SegundoFator({ retorno }: { retorno: string | undefined }) {
  const t = useTranslations('segundoFator');
  const router = useRouter();
  const sessao = useSessao();
  const [codigos, setCodigos] = useState<readonly string[] | null>(null);
  const passo = sessao.data?.proximoPasso;

  // Sessão já completa (ex.: voltou pelo histórico): segue para o destino.
  useEffect(() => {
    if (passo === null && codigos === null) router.replace(retornoSeguro(retorno));
  }, [passo, codigos, retorno, router]);

  if (codigos !== null) {
    return (
      <CodigosDeRecuperacao
        codigos={codigos}
        aoContinuar={() => {
          router.replace(retornoSeguro(retorno));
        }}
      />
    );
  }
  if (passo === 'verificar-2fa') return <Verificar retorno={retorno} />;
  if (passo === 'configurar-2fa') return <Configurar aoAtivar={setCodigos} />;
  return (
    <PaginaAcesso titulo={t('titulo')}>
      <EstadoCarregando />
    </PaginaAcesso>
  );
}

function FormularioCodigo({
  enviar,
  pendente,
  erro,
  rotuloEnviar,
}: {
  enviar: (codigo: string) => void;
  pendente: boolean;
  erro: unknown;
  rotuloEnviar: string;
}) {
  const t = useTranslations();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ codigo: string }>({ resolver: zodResolver(CodigoSegundoFator.esquema) });
  const aoEnviar = handleSubmit(({ codigo }) => {
    enviar(codigo.trim());
  });
  return (
    <form noValidate onSubmit={(evento) => void aoEnviar(evento)} className="grid gap-4">
      <AlertaFormulario erro={erro} seNaoAutorizado="codigoInvalido" />
      <Campo
        rotulo={t('segundoFator.codigo')}
        autoComplete="one-time-code"
        autoFocus
        spellCheck={false}
        obrigatorio
        erro={errors.codigo && t(`validacao.${chaveValidacao(errors.codigo.type)}`)}
        {...register('codigo')}
      />
      <Botao type="submit" carregando={pendente}>
        {rotuloEnviar}
      </Botao>
    </form>
  );
}

function Verificar({ retorno }: { retorno: string | undefined }) {
  const t = useTranslations('segundoFator');
  const router = useRouter();
  const verificar = useVerificarSegundoFator();
  return (
    <PaginaAcesso titulo={t('titulo')} descricao={t('verificarDescricao')}>
      <FormularioCodigo
        rotuloEnviar={t('verificar')}
        pendente={verificar.isPending || verificar.isSuccess}
        erro={verificar.error}
        enviar={(codigo) => {
          verificar.mutate(
            { codigo },
            {
              onSuccess: (sessao) => {
                router.replace(destinoAposEntrar(sessao.proximoPasso, retorno));
              },
            },
          );
        }}
      />
    </PaginaAcesso>
  );
}

function Configurar({ aoAtivar }: { aoAtivar: (codigos: readonly string[]) => void }) {
  const t = useTranslations('segundoFator');
  const configurar = useConfigurarSegundoFator();
  const ativar = useAtivarSegundoFator();
  const [configuracao, setConfiguracao] = useState<ConfiguracaoSegundoFator | null>(null);
  // Cada chamada gera um segredo novo: uma por montagem, mesmo com o efeito duplo do StrictMode.
  const pedido = useRef(false);
  const { mutate } = configurar;
  useEffect(() => {
    if (pedido.current) return;
    pedido.current = true;
    mutate(undefined, { onSuccess: setConfiguracao });
  }, [mutate]);

  return (
    <PaginaAcesso titulo={t('configurarTitulo')} descricao={t('configurarDescricao')}>
      <AlertaFormulario erro={configurar.error} seNaoAutorizado="codigoInvalido" />
      {configuracao === null ? (
        configurar.isPending ? (
          <EstadoCarregando rotulo={t('gerandoQr')} />
        ) : null
      ) : (
        <>
          <div className="flex justify-center rounded-md bg-white p-3">
            <QRCodeSVG value={configuracao.uri} size={192} role="img" aria-label={t('qrRotulo')} />
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-texto-suave">{t('segredoManual')}</p>
            <p className="font-mono break-all select-all">{configuracao.segredo}</p>
          </div>
          <FormularioCodigo
            rotuloEnviar={t('ativar')}
            pendente={ativar.isPending}
            erro={ativar.error}
            enviar={(codigo) => {
              ativar.mutate(
                { codigo },
                {
                  onSuccess: ({ codigosDeRecuperacao }) => {
                    aoAtivar(codigosDeRecuperacao);
                  },
                },
              );
            }}
          />
        </>
      )}
    </PaginaAcesso>
  );
}

function CodigosDeRecuperacao({
  codigos,
  aoContinuar,
}: {
  codigos: readonly string[];
  aoContinuar: () => void;
}) {
  const t = useTranslations('segundoFator');
  // O foco vai para o título: a tela mudou sem navegação, e o leitor de tela precisa saber.
  useEffect(() => {
    document.getElementById('titulo-acesso')?.focus();
  }, []);
  return (
    <PaginaAcesso titulo={t('codigosTitulo')} descricao={t('codigosDescricao')}>
      <ul className="grid grid-cols-2 gap-2 rounded-md border border-borda p-3 font-mono text-sm">
        {codigos.map((codigo) => (
          <li key={codigo}>{codigo}</li>
        ))}
      </ul>
      <div className="grid gap-2">
        <Botao
          variante="secundaria"
          onClick={() => {
            navigator.clipboard.writeText(codigos.join('\n')).then(
              () => avisar.sucesso(t('copiados')),
              () => avisar.erro(t('copiaFalhou')),
            );
          }}
        >
          {t('copiar')}
        </Botao>
        <Botao onClick={aoContinuar}>{t('continuar')}</Botao>
      </div>
    </PaginaAcesso>
  );
}
