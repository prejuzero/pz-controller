'use client';

import {
  avisar,
  Botao,
  Campo,
  Dialogo,
  EstadoCarregando,
  EstadoVazio,
  FecharDialogo,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import { ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  useAtualizarCliente,
  useCadastrarCliente,
  useClientes,
  useRemoverCliente,
} from '../../../../api/hooks';
import { SePermitido } from '../../_casca/se-permitido';

import type { ClienteDoTenant } from '@pz/contracts';

/** Gestão simples dos clientes do escritório (HU12), para vincular aos processos. */
export function Clientes() {
  const t = useTranslations('clientes');
  const clientes = useClientes();

  const colunas: ColunaTabela<ClienteDoTenant>[] = [
    { accessorKey: 'nome', header: t('colunas.nome') },
    {
      accessorKey: 'documento',
      header: t('colunas.documento'),
      cell: ({ row }) => row.original.documento ?? '—',
    },
    {
      id: 'acoes',
      header: t('colunas.acoes'),
      cell: ({ row }) => (
        <SePermitido permissao="processos:gerir">
          <span className="flex flex-wrap gap-2">
            <FormularioCliente cliente={row.original} />
            <RemoverCliente cliente={row.original} />
          </span>
        </SePermitido>
      ),
    },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/processos"
        className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('voltar')}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
          <p className="text-texto-suave">{t('descricao')}</p>
        </div>
        <SePermitido permissao="processos:gerir">
          <FormularioCliente />
        </SePermitido>
      </div>
      {clientes.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <TabelaDados
          titulo={t('titulo')}
          colunas={colunas}
          dados={clientes.data.itens}
          idLinha={(cliente) => cliente.id}
          tamanhoPagina={20}
          vazio={<EstadoVazio descricao={t('vazio')} />}
        />
      )}
    </div>
  );
}

/** Sem `cliente`, cadastra; com ele, edita. */
function FormularioCliente({ cliente }: { cliente?: ClienteDoTenant }) {
  const t = useTranslations('clientes');
  const cadastrar = useCadastrarCliente();
  const atualizar = useAtualizarCliente();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(cliente?.nome ?? '');
  const [documento, setDocumento] = useState(cliente?.documento ?? '');
  const titulo = cliente === undefined ? t('novo') : t('editar');
  const nomeValido = nome.trim().length >= 2;

  const concluir = (mensagem: string) => {
    setAberto(false);
    avisar.sucesso(mensagem);
    if (cliente === undefined) {
      setNome('');
      setDocumento('');
    }
  };

  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={
        cliente === undefined ? (
          <Botao>
            <Plus className="size-4" aria-hidden />
            {titulo}
          </Botao>
        ) : (
          <Botao variante="secundaria">{titulo}</Botao>
        )
      }
      titulo={titulo}
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!nomeValido) return;
          const dados = {
            nome: nome.trim(),
            documento: documento.trim() === '' ? null : documento.trim(),
          };
          if (cliente === undefined)
            cadastrar.mutate(dados, {
              onSuccess: () => {
                concluir(t('cadastrado'));
              },
            });
          else
            atualizar.mutate(
              { id: cliente.id, ...dados },
              {
                onSuccess: () => {
                  concluir(t('salvo'));
                },
              },
            );
        }}
      >
        <Campo
          rotulo={t('nome')}
          obrigatorio
          minLength={2}
          maxLength={200}
          value={nome}
          onChange={(evento) => {
            setNome(evento.target.value);
          }}
        />
        <Campo
          rotulo={t('documento')}
          ajuda={t('documentoAjuda')}
          maxLength={30}
          value={documento}
          onChange={(evento) => {
            setDocumento(evento.target.value);
          }}
        />
        <Botao
          type="submit"
          carregando={cadastrar.isPending || atualizar.isPending}
          disabled={!nomeValido}
          className="justify-self-end"
        >
          {cliente === undefined ? t('cadastrar') : t('salvar')}
        </Botao>
      </form>
    </Dialogo>
  );
}

function RemoverCliente({ cliente }: { cliente: ClienteDoTenant }) {
  const t = useTranslations('clientes');
  const remover = useRemoverCliente();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('remover')}</Botao>}
      titulo={t('removerTitulo', { nome: cliente.nome })}
      descricao={t('removerDescricao')}
      acoes={
        <>
          <FecharDialogo asChild>
            <Botao variante="secundaria">{t('cancelar')}</Botao>
          </FecharDialogo>
          <Botao
            variante="perigo"
            carregando={remover.isPending}
            onClick={() => {
              remover.mutate(cliente.id, {
                onSuccess: () => {
                  setAberto(false);
                  avisar.sucesso(t('removido'));
                },
              });
            }}
          >
            {t('remover')}
          </Botao>
        </>
      }
    />
  );
}
