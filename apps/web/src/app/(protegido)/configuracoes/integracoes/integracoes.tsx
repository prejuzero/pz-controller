'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PedidoDeAppOAuth,
  PedidoDeAssinaturaDeWebhook,
  PedidoDeClienteDeIntegracao,
} from '@pz/contracts';
import {
  avisar,
  Botao,
  Campo,
  classesEntrada,
  cn,
  Dialogo,
  EstadoCarregando,
  EstadoVazio,
  EnvoltorioCampo,
  FecharDialogo,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
  type TomSelo,
} from '@pz/ui';
import { Copy, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useForm, type FieldError, type UseFormRegisterReturn } from 'react-hook-form';

import {
  useClientesDeIntegracao,
  useDesativarWebhook,
  useEntregasDeWebhook,
  useEscoposDeIntegracao,
  useEventosDeWebhook,
  useReenviarEntrega,
  useRegistrarApp,
  useRegistrarCliente,
  useRegistrarWebhook,
  useRevogarCliente,
  useTestarWebhook,
  useWebhooks,
} from '../../../../api/hooks';
import { chaveValidacao } from '../../../../formularios';
import { formatarInstante } from '../../../../i18n/formatar';

import type { AssinaturasDeWebhook, ClientesDeIntegracao, EntregasDeWebhook } from '@pz/contracts';
import type { z } from 'zod';

type Cliente = ClientesDeIntegracao['itens'][number];
type Webhook = AssinaturasDeWebhook['itens'][number];
type Entrega = EntregasDeWebhook['itens'][number];

/** Configurações > Integrações (HU49): clientes da API (OAuth) e webhooks de saída. */
export function Integracoes() {
  const t = useTranslations('integracoes');
  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="max-w-3xl text-texto-suave">{t('descricao')}</p>
        <p className="text-sm text-texto-suave">{t('guia')}</p>
      </div>
      <Secao
        titulo={t('clientes.titulo')}
        descricao={`${t('clientes.descricao')} ${t('apps.descricao')}`}
        acao={
          <div className="flex flex-wrap gap-2">
            <NovoApp />
            <NovoCliente />
          </div>
        }
      >
        <Clientes />
      </Secao>
      <Secao
        titulo={t('webhooks.titulo')}
        descricao={t('webhooks.descricao')}
        acao={<NovoWebhook />}
      >
        <Webhooks />
      </Secao>
      <Secao titulo={t('entregas.titulo')}>
        <Entregas />
      </Secao>
    </div>
  );
}

function Secao({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          {descricao === undefined ? null : (
            <p className="max-w-3xl text-sm text-texto-suave">{descricao}</p>
          )}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Situacao({
  inativoEm,
  rotuloInativo,
}: {
  inativoEm: string | null;
  rotuloInativo: string;
}) {
  const t = useTranslations('integracoes');
  return inativoEm === null ? (
    <SeloStatus tom="sucesso">{t('ativo')}</SeloStatus>
  ) : (
    <SeloStatus tom="neutro">{rotuloInativo}</SeloStatus>
  );
}

function Clientes() {
  const t = useTranslations('integracoes');
  const clientes = useClientesDeIntegracao();
  if (clientes.data === undefined) return <EstadoCarregando />;
  const colunas: ColunaTabela<Cliente>[] = [
    { accessorKey: 'nome', header: t('clientes.colunas.nome') },
    {
      accessorKey: 'tipo',
      header: t('clientes.colunas.tipo'),
      cell: ({ row }) => t(`clientes.tipos.${row.original.tipo}`),
    },
    {
      id: 'escopos',
      header: t('clientes.colunas.escopos'),
      cell: ({ row }) => row.original.escopos.join(', '),
    },
    {
      accessorKey: 'ultimoUso',
      header: t('clientes.colunas.ultimoUso'),
      cell: ({ row }) =>
        row.original.ultimoUso === null ? t('nunca') : formatarInstante(row.original.ultimoUso),
    },
    {
      id: 'situacao',
      header: t('clientes.colunas.situacao'),
      cell: ({ row }) => (
        <Situacao inativoEm={row.original.revogadoEm} rotuloInativo={t('revogado')} />
      ),
    },
    {
      id: 'acoes',
      header: t('clientes.colunas.acoes'),
      cell: ({ row }) =>
        row.original.revogadoEm === null ? <RevogarCliente cliente={row.original} /> : null,
    },
  ];
  return (
    <TabelaDados
      titulo={t('clientes.titulo')}
      colunas={colunas}
      dados={clientes.data.itens}
      tamanhoPagina={10}
      vazio={<EstadoVazio descricao={t('clientes.vazio')} />}
    />
  );
}

/** Segredo mostrado uma única vez, com aviso e botão de copiar. */
function SegredoUmaVez({ itens }: { itens: { rotulo: string; valor: string }[] }) {
  const t = useTranslations('integracoes');
  return (
    <div className="space-y-3">
      <p role="alert" className="rounded-md border border-alerta p-3 text-sm">
        {t('segredoAviso')}
      </p>
      {itens.map(({ rotulo, valor }) => (
        <div key={rotulo} className="space-y-1">
          <p className="text-sm font-medium">{rotulo}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-superficie-elevada p-2 text-xs">
              {valor}
            </code>
            <Botao
              variante="secundaria"
              aria-label={`${t('copiar')}: ${rotulo}`}
              onClick={() => {
                void navigator.clipboard.writeText(valor).then(() => avisar.sucesso(t('copiado')));
              }}
            >
              <Copy className="size-4" aria-hidden />
            </Botao>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Grupo de caixas de seleção (escopos ou eventos) ligado ao formulário. */
function Opcoes({
  legenda,
  opcoes,
  erro,
  registrar,
}: {
  legenda: string;
  opcoes: { valor: string; rotulo: string; descricao: string }[];
  erro: string | undefined;
  registrar: UseFormRegisterReturn;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legenda}</legend>
      {opcoes.map((opcao) => (
        <label key={opcao.valor} className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" value={opcao.valor} {...registrar} />
          <span>
            <span className="font-mono text-xs">{opcao.rotulo}</span>
            <span className="block text-texto-suave">{opcao.descricao}</span>
          </span>
        </label>
      ))}
      {erro === undefined ? null : (
        <p role="alert" className="text-sm text-perigo">
          {erro}
        </p>
      )}
    </fieldset>
  );
}

type PedidoDeCliente = z.infer<typeof PedidoDeClienteDeIntegracao.esquema>;

function NovoCliente() {
  const t = useTranslations('integracoes');
  const tv = useTranslations('validacao');
  const escopos = useEscoposDeIntegracao();
  const registrar = useRegistrarCliente();
  const [aberto, setAberto] = useState(false);
  const [criado, setCriado] = useState<{ id: string; segredo: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PedidoDeCliente>({
    resolver: zodResolver(PedidoDeClienteDeIntegracao.esquema),
    defaultValues: { nome: '', escopos: [] },
  });
  const erro = (campo: FieldError | undefined) => campo && tv(chaveValidacao(campo.type));
  const enviar = handleSubmit((pedido) => {
    registrar.mutate(pedido, {
      onSuccess: (r) => {
        setCriado({ id: r.cliente.id, segredo: r.segredo });
        reset();
      },
    });
  });
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={(valor) => {
        setAberto(valor);
        if (!valor) setCriado(null);
      }}
      gatilho={
        <Botao>
          <Plus className="size-4" aria-hidden />
          {t('clientes.novo')}
        </Botao>
      }
      titulo={criado === null ? t('clientes.novo') : t('clientes.criado')}
    >
      {criado !== null ? (
        <SegredoUmaVez
          itens={[
            { rotulo: t('clientes.id'), valor: criado.id },
            { rotulo: t('clientes.segredo'), valor: criado.segredo },
          ]}
        />
      ) : escopos.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <form method="post" noValidate onSubmit={(e) => void enviar(e)} className="grid gap-4">
          <Campo
            rotulo={t('clientes.nome')}
            ajuda={t('clientes.ajudaNome')}
            obrigatorio
            maxLength={100}
            erro={erro(errors.nome)}
            {...register('nome')}
          />
          <Opcoes
            legenda={t('clientes.escopos')}
            opcoes={escopos.data.itens.map((e) => ({
              valor: e.escopo,
              rotulo: e.escopo,
              descricao: e.descricao,
            }))}
            erro={errors.escopos === undefined ? undefined : t('clientes.escoposErro')}
            registrar={register('escopos')}
          />
          <Botao type="submit" carregando={registrar.isPending}>
            {t('clientes.criar')}
          </Botao>
        </form>
      )}
    </Dialogo>
  );
}

const EsquemaDoApp = PedidoDeAppOAuth.esquema;
type PedidoDeApp = z.infer<typeof EsquemaDoApp>;

/** Lista de endereços de retorno: um por linha. */
const linhas = (valor: unknown) =>
  typeof valor === 'string'
    ? valor
        .split('\n')
        .map((linha) => linha.trim())
        .filter((linha) => linha !== '')
    : valor;

/** App público (Authorization Code + PKCE): sem segredo, com endereços de retorno. */
function NovoApp() {
  const t = useTranslations('integracoes');
  const tv = useTranslations('validacao');
  const escopos = useEscoposDeIntegracao();
  const registrar = useRegistrarApp();
  const [aberto, setAberto] = useState(false);
  const [criado, setCriado] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PedidoDeApp>({
    resolver: zodResolver(EsquemaDoApp),
    defaultValues: { nome: '', escopos: [], redirectUris: [] },
  });
  const erro = (campo: FieldError | undefined) => campo && tv(chaveValidacao(campo.type));
  const enviar = handleSubmit((pedido) => {
    registrar.mutate(pedido, {
      onSuccess: (r) => {
        setCriado(r.cliente.id);
        reset();
      },
    });
  });
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={(valor) => {
        setAberto(valor);
        if (!valor) setCriado(null);
      }}
      gatilho={
        <Botao variante="secundaria">
          <Plus className="size-4" aria-hidden />
          {t('apps.novo')}
        </Botao>
      }
      titulo={criado === null ? t('apps.novo') : t('apps.criado')}
    >
      {criado !== null ? (
        <div className="space-y-3">
          <p className="text-sm">{t('apps.semSegredo')}</p>
          <p className="text-sm font-medium">{t('apps.id')}</p>
          <code className="block break-all rounded bg-superficie-elevada p-2 text-xs">
            {criado}
          </code>
        </div>
      ) : escopos.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <form method="post" noValidate onSubmit={(e) => void enviar(e)} className="grid gap-4">
          <Campo
            rotulo={t('apps.nome')}
            ajuda={t('apps.ajudaNome')}
            obrigatorio
            maxLength={100}
            erro={erro(errors.nome)}
            {...register('nome')}
          />
          <Opcoes
            legenda={t('apps.escopos')}
            opcoes={escopos.data.itens.map((e) => ({
              valor: e.escopo,
              rotulo: e.escopo,
              descricao: e.descricao,
            }))}
            erro={errors.escopos === undefined ? undefined : t('clientes.escoposErro')}
            registrar={register('escopos')}
          />
          <EnvoltorioCampo
            rotulo={t('apps.retornos')}
            ajuda={t('apps.ajudaRetornos')}
            obrigatorio
            erro={errors.redirectUris === undefined ? undefined : t('apps.retornosErro')}
          >
            {({ id, descricao, invalido }) => (
              <textarea
                id={id}
                rows={3}
                className={cn(classesEntrada, 'h-auto py-2 font-mono text-xs')}
                aria-describedby={descricao}
                aria-invalid={invalido || undefined}
                {...register('redirectUris', { setValueAs: linhas })}
              />
            )}
          </EnvoltorioCampo>
          <Botao type="submit" carregando={registrar.isPending}>
            {t('apps.criar')}
          </Botao>
        </form>
      )}
    </Dialogo>
  );
}

function RevogarCliente({ cliente }: { cliente: Cliente }) {
  const t = useTranslations('integracoes');
  const revogar = useRevogarCliente();
  return (
    <Confirmar
      rotulo={t('clientes.revogar')}
      titulo={t('clientes.revogarTitulo', { nome: cliente.nome })}
      descricao={t('clientes.revogarDescricao')}
      carregando={revogar.isPending}
      aoConfirmar={(fechar) => {
        revogar.mutate(cliente.id, {
          onSuccess: () => {
            fechar();
            avisar.sucesso(t('clientes.revogadoAviso'));
          },
        });
      }}
    />
  );
}

function Confirmar({
  rotulo,
  titulo,
  descricao,
  carregando,
  aoConfirmar,
}: {
  rotulo: string;
  titulo: string;
  descricao: string;
  carregando: boolean;
  aoConfirmar: (fechar: () => void) => void;
}) {
  const t = useTranslations('integracoes');
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{rotulo}</Botao>}
      titulo={titulo}
      descricao={descricao}
      acoes={
        <>
          <FecharDialogo asChild>
            <Botao variante="secundaria">{t('cancelar')}</Botao>
          </FecharDialogo>
          <Botao
            variante="perigo"
            carregando={carregando}
            onClick={() => {
              aoConfirmar(() => {
                setAberto(false);
              });
            }}
          >
            {rotulo}
          </Botao>
        </>
      }
    />
  );
}

function Webhooks() {
  const t = useTranslations('integracoes');
  const webhooks = useWebhooks();
  if (webhooks.data === undefined) return <EstadoCarregando />;
  const colunas: ColunaTabela<Webhook>[] = [
    { accessorKey: 'descricao', header: t('webhooks.colunas.descricao') },
    {
      accessorKey: 'url',
      header: t('webhooks.colunas.url'),
      cell: ({ row }) => (
        <span className="block max-w-64 truncate font-mono text-xs" title={row.original.url}>
          {row.original.url}
        </span>
      ),
    },
    {
      id: 'eventos',
      header: t('webhooks.colunas.eventos'),
      cell: ({ row }) => row.original.eventos.join(', '),
    },
    {
      id: 'situacao',
      header: t('webhooks.colunas.situacao'),
      cell: ({ row }) => (
        <Situacao inativoEm={row.original.desativadaEm} rotuloInativo={t('desativado')} />
      ),
    },
    {
      id: 'acoes',
      header: t('webhooks.colunas.acoes'),
      cell: ({ row }) =>
        row.original.desativadaEm === null ? <AcoesDoWebhook webhook={row.original} /> : null,
    },
  ];
  return (
    <TabelaDados
      titulo={t('webhooks.titulo')}
      colunas={colunas}
      dados={webhooks.data.itens}
      tamanhoPagina={10}
      vazio={<EstadoVazio descricao={t('webhooks.vazio')} />}
    />
  );
}

function AcoesDoWebhook({ webhook }: { webhook: Webhook }) {
  const t = useTranslations('integracoes');
  const testar = useTestarWebhook();
  const desativar = useDesativarWebhook();
  return (
    <div className="flex flex-wrap gap-2">
      <Botao
        variante="secundaria"
        carregando={testar.isPending}
        onClick={() => {
          testar.mutate(webhook.id, {
            onSuccess: () => avisar.sucesso(t('webhooks.testeEnviado')),
          });
        }}
      >
        {t('webhooks.testar')}
      </Botao>
      <Confirmar
        rotulo={t('webhooks.desativar')}
        titulo={t('webhooks.desativarTitulo', { descricao: webhook.descricao })}
        descricao={t('webhooks.desativarDescricao')}
        carregando={desativar.isPending}
        aoConfirmar={(fechar) => {
          desativar.mutate(webhook.id, {
            onSuccess: () => {
              fechar();
              avisar.sucesso(t('webhooks.desativadoAviso'));
            },
          });
        }}
      />
    </div>
  );
}

type PedidoDeWebhook = z.infer<typeof PedidoDeAssinaturaDeWebhook.esquema>;

function NovoWebhook() {
  const t = useTranslations('integracoes');
  const tv = useTranslations('validacao');
  const eventos = useEventosDeWebhook();
  const registrar = useRegistrarWebhook();
  const [aberto, setAberto] = useState(false);
  const [segredo, setSegredo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PedidoDeWebhook>({
    resolver: zodResolver(PedidoDeAssinaturaDeWebhook.esquema),
    defaultValues: { url: '', descricao: '', eventos: [] },
  });
  const erro = (campo: FieldError | undefined) => campo && tv(chaveValidacao(campo.type));
  const enviar = handleSubmit((pedido) => {
    registrar.mutate(pedido, {
      onSuccess: (r) => {
        setSegredo(r.segredo);
        reset();
      },
    });
  });
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={(valor) => {
        setAberto(valor);
        if (!valor) setSegredo(null);
      }}
      gatilho={
        <Botao>
          <Plus className="size-4" aria-hidden />
          {t('webhooks.novo')}
        </Botao>
      }
      titulo={segredo === null ? t('webhooks.novo') : t('webhooks.criado')}
    >
      {segredo !== null ? (
        <SegredoUmaVez itens={[{ rotulo: t('webhooks.segredo'), valor: segredo }]} />
      ) : eventos.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <form method="post" noValidate onSubmit={(e) => void enviar(e)} className="grid gap-4">
          <Campo
            rotulo={t('webhooks.descricaoCampo')}
            obrigatorio
            maxLength={100}
            erro={erro(errors.descricao)}
            {...register('descricao')}
          />
          <Campo
            rotulo={t('webhooks.url')}
            ajuda={t('webhooks.ajudaUrl')}
            obrigatorio
            type="url"
            inputMode="url"
            maxLength={2000}
            erro={erro(errors.url)}
            {...register('url')}
          />
          <Opcoes
            legenda={t('webhooks.eventos')}
            opcoes={eventos.data.itens.map((e) => ({
              valor: e.tipo,
              rotulo: e.tipo,
              descricao: e.descricao,
            }))}
            erro={errors.eventos === undefined ? undefined : t('webhooks.eventosErro')}
            registrar={register('eventos')}
          />
          <Botao type="submit" carregando={registrar.isPending}>
            {t('webhooks.criar')}
          </Botao>
        </form>
      )}
    </Dialogo>
  );
}

const TOM_DA_SITUACAO: Record<Entrega['situacao'], TomSelo> = {
  pendente: 'alerta',
  entregue: 'sucesso',
  falhou: 'perigo',
};

function Entregas() {
  const t = useTranslations('integracoes');
  const entregas = useEntregasDeWebhook();
  if (entregas.data === undefined) return <EstadoCarregando />;
  const colunas: ColunaTabela<Entrega>[] = [
    {
      accessorKey: 'criadoEm',
      header: t('entregas.colunas.quando'),
      cell: ({ row }) => formatarInstante(row.original.criadoEm),
    },
    {
      accessorKey: 'tipo',
      header: t('entregas.colunas.evento'),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.tipo}</span>,
    },
    {
      accessorKey: 'situacao',
      header: t('entregas.colunas.situacao'),
      cell: ({ row }) => (
        <SeloStatus tom={TOM_DA_SITUACAO[row.original.situacao]}>
          {t(`entregas.situacoes.${row.original.situacao}`)}
        </SeloStatus>
      ),
    },
    { accessorKey: 'tentativas', header: t('entregas.colunas.tentativas') },
    {
      id: 'erro',
      header: t('entregas.colunas.erro'),
      cell: ({ row }) => row.original.ultimoErro ?? '—',
    },
    {
      id: 'acoes',
      header: t('entregas.colunas.acoes'),
      cell: ({ row }) =>
        row.original.situacao === 'falhou' ? <Reenviar entrega={row.original} /> : null,
    },
  ];
  return (
    <TabelaDados
      titulo={t('entregas.titulo')}
      colunas={colunas}
      dados={entregas.data.itens}
      tamanhoPagina={10}
      vazio={<EstadoVazio descricao={t('entregas.vazio')} />}
    />
  );
}

function Reenviar({ entrega }: { entrega: Entrega }) {
  const t = useTranslations('integracoes');
  const reenviar = useReenviarEntrega();
  return (
    <Botao
      variante="secundaria"
      carregando={reenviar.isPending}
      onClick={() => {
        reenviar.mutate(entrega.id, { onSuccess: () => avisar.sucesso(t('entregas.reenviada')) });
      }}
    >
      {t('entregas.reenviar')}
    </Botao>
  );
}
