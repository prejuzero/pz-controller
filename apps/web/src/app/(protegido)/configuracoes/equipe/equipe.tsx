'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PedidoDeConvite } from '@pz/contracts';
import {
  avisar,
  Botao,
  Campo,
  Dialogo,
  EstadoCarregando,
  EstadoVazio,
  FecharDialogo,
  Selecao,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, type FieldError } from 'react-hook-form';

import { descreverErro } from '../../../../api/erros';
import {
  useAlterarPerfis,
  useCancelarConvite,
  useConvidarMembro,
  useDesativarMembro,
  useMembrosDaEquipe,
  useSessao,
} from '../../../../api/hooks';
import { chaveValidacao } from '../../../../formularios';
import { formatarInstante } from '../../../../i18n/formatar';

import type { EquipeDoEscritorio } from '@pz/contracts';
import type { z } from 'zod';

type Membro = EquipeDoEscritorio['membros'][number];
type Convite = EquipeDoEscritorio['convites'][number];
type Pedido = z.infer<typeof PedidoDeConvite.esquema>;
type Perfil = Pedido['perfil'];

const PERFIS: readonly Perfil[] = ['advogado', 'colaborador', 'admin_escritorio'];

/** Configurações > Equipe (HU41): convites, perfis e desativação de membros. */
export function Equipe() {
  const t = useTranslations('equipe');
  const equipe = useMembrosDaEquipe();
  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
          <p className="max-w-3xl text-texto-suave">{t('descricao')}</p>
        </div>
        <Convidar />
      </div>
      {equipe.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <>
          <Secao titulo={t('membros.titulo')}>
            <Membros membros={equipe.data.membros} />
          </Secao>
          <Secao titulo={t('convites.titulo')}>
            <Convites convites={equipe.data.convites} />
          </Secao>
        </>
      )}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Membros({ membros }: { membros: Membro[] }) {
  const t = useTranslations('equipe');
  const eu = useSessao().data?.usuarioId;
  const colunas: ColunaTabela<Membro>[] = [
    { accessorKey: 'nome', header: t('colunas.nome') },
    { accessorKey: 'email', header: t('colunas.email') },
    {
      id: 'perfis',
      header: t('colunas.perfis'),
      cell: ({ row }) => row.original.perfis.map((p) => t(`perfis.${p as Perfil}`)).join(', '),
    },
    {
      id: 'situacao',
      header: t('colunas.situacao'),
      cell: ({ row }) =>
        row.original.desativadoEm === null ? (
          <SeloStatus tom="sucesso">{t('ativo')}</SeloStatus>
        ) : (
          <SeloStatus tom="neutro">{t('desativado')}</SeloStatus>
        ),
    },
    {
      id: 'acoes',
      header: t('colunas.acoes'),
      cell: ({ row }) =>
        row.original.desativadoEm === null ? (
          <div className="flex flex-wrap gap-2">
            <AlterarPerfis membro={row.original} />
            {row.original.usuarioId === eu ? null : <Desativar membro={row.original} />}
          </div>
        ) : null,
    },
  ];
  return (
    <TabelaDados
      titulo={t('membros.titulo')}
      colunas={colunas}
      dados={membros}
      tamanhoPagina={20}
      vazio={<EstadoVazio descricao={t('membros.vazio')} />}
    />
  );
}

function Convites({ convites }: { convites: Convite[] }) {
  const t = useTranslations('equipe');
  const cancelar = useCancelarConvite();
  const colunas: ColunaTabela<Convite>[] = [
    { accessorKey: 'nome', header: t('colunas.nome') },
    { accessorKey: 'email', header: t('colunas.email') },
    {
      accessorKey: 'perfil',
      header: t('colunas.perfis'),
      cell: ({ row }) => t(`perfis.${row.original.perfil}`),
    },
    {
      accessorKey: 'expiraEm',
      header: t('colunas.expira'),
      cell: ({ row }) => formatarInstante(row.original.expiraEm),
    },
    {
      id: 'acoes',
      header: t('colunas.acoes'),
      cell: ({ row }) => (
        <Botao
          variante="secundaria"
          carregando={cancelar.isPending}
          onClick={() => {
            cancelar.mutate(row.original.id, {
              onSuccess: () => avisar.sucesso(t('convites.cancelado')),
            });
          }}
        >
          {t('convites.cancelar')}
        </Botao>
      ),
    },
  ];
  return (
    <TabelaDados
      titulo={t('convites.titulo')}
      colunas={colunas}
      dados={convites}
      tamanhoPagina={20}
      vazio={<EstadoVazio descricao={t('convites.vazio')} />}
    />
  );
}

function Convidar() {
  const t = useTranslations('equipe');
  const tv = useTranslations('validacao');
  const convidar = useConvidarMembro();
  const [aberto, setAberto] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Pedido>({
    resolver: zodResolver(PedidoDeConvite.esquema),
    defaultValues: { email: '', nome: '', perfil: 'colaborador' },
  });
  const erro = (campo: FieldError | undefined) => campo && tv(chaveValidacao(campo.type));
  const enviar = handleSubmit((pedido) => {
    convidar.mutate(pedido, {
      onSuccess: () => {
        setAberto(false);
        reset();
        avisar.sucesso(t('convites.enviado'));
      },
    });
  });
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={
        <Botao>
          <UserPlus className="size-4" aria-hidden />
          {t('convidar')}
        </Botao>
      }
      titulo={t('convidar')}
      descricao={t('convidarDescricao')}
    >
      <form method="post" noValidate onSubmit={(e) => void enviar(e)} className="grid gap-4">
        <Campo
          rotulo={t('campos.nome')}
          obrigatorio
          maxLength={200}
          erro={erro(errors.nome)}
          {...register('nome')}
        />
        <Campo
          rotulo={t('campos.email')}
          type="email"
          autoComplete="off"
          obrigatorio
          maxLength={254}
          erro={erro(errors.email)}
          {...register('email')}
        />
        <Controller
          control={control}
          name="perfil"
          render={({ field }) => (
            <Selecao
              rotulo={t('campos.perfil')}
              obrigatorio
              opcoes={PERFIS.map((p) => ({ valor: p, rotulo: t(`perfis.${p}`) }))}
              valor={field.value}
              aoMudar={field.onChange}
              name={field.name}
            />
          )}
        />
        {convidar.error === null ? null : (
          <p role="alert" className="text-sm text-perigo">
            {descreverErro(convidar.error).descricao}
          </p>
        )}
        <Botao type="submit" carregando={convidar.isPending}>
          {t('enviarConvite')}
        </Botao>
      </form>
    </Dialogo>
  );
}

function AlterarPerfis({ membro }: { membro: Membro }) {
  const t = useTranslations('equipe');
  const alterar = useAlterarPerfis();
  const [aberto, setAberto] = useState(false);
  const [perfis, setPerfis] = useState<Perfil[]>(
    membro.perfis.filter((p): p is Perfil => (PERFIS as readonly string[]).includes(p)),
  );
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('alterarPerfis')}</Botao>}
      titulo={t('alterarPerfisTitulo', { nome: membro.nome })}
      acoes={
        <>
          <FecharDialogo asChild>
            <Botao variante="secundaria">{t('cancelar')}</Botao>
          </FecharDialogo>
          <Botao
            carregando={alterar.isPending}
            disabled={perfis.length === 0}
            onClick={() => {
              alterar.mutate(
                { id: membro.usuarioId, perfis },
                {
                  onSuccess: () => {
                    setAberto(false);
                    avisar.sucesso(t('perfisAlterados'));
                  },
                },
              );
            }}
          >
            {t('salvar')}
          </Botao>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('campos.perfis')}</legend>
        {PERFIS.map((p) => (
          <label key={p} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={perfis.includes(p)}
              onChange={(evento) => {
                setPerfis((atuais) =>
                  evento.target.checked ? [...atuais, p] : atuais.filter((x) => x !== p),
                );
              }}
            />
            <span>
              <span className="font-medium">{t(`perfis.${p}`)}</span>
              <span className="block text-texto-suave">{t(`perfisDescricao.${p}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {alterar.error === null ? null : (
        <p role="alert" className="text-sm text-perigo">
          {descreverErro(alterar.error).descricao}
        </p>
      )}
    </Dialogo>
  );
}

function Desativar({ membro }: { membro: Membro }) {
  const t = useTranslations('equipe');
  const desativar = useDesativarMembro();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('desativar')}</Botao>}
      titulo={t('desativarTitulo', { nome: membro.nome })}
      descricao={t('desativarDescricao')}
      acoes={
        <>
          <FecharDialogo asChild>
            <Botao variante="secundaria">{t('cancelar')}</Botao>
          </FecharDialogo>
          <Botao
            variante="perigo"
            carregando={desativar.isPending}
            onClick={() => {
              desativar.mutate(membro.usuarioId, {
                onSuccess: () => {
                  setAberto(false);
                  avisar.sucesso(t('desativadoAviso'));
                },
              });
            }}
          >
            {t('desativar')}
          </Botao>
        </>
      }
    >
      {desativar.error === null ? null : (
        <p role="alert" className="text-sm text-perigo">
          {descreverErro(desativar.error).descricao}
        </p>
      )}
    </Dialogo>
  );
}
