'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PedidoDeSuspensao } from '@pz/contracts';
import {
  avisar,
  Botao,
  Campo,
  Dialogo,
  EstadoCarregando,
  EstadoVazio,
  Selecao,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useWatch, type FieldError } from 'react-hook-form';

import {
  useAlterarAssinatura,
  useImpersonar,
  useReativarTenant,
  useSuspenderTenant,
  useTenants,
} from '../../../api/hooks';
import { chaveValidacao } from '../../../formularios';
import { formatarInstante } from '../../../i18n/formatar';
import { SePermitido } from '../_casca/se-permitido';

import type { TenantAdministrado } from '@pz/contracts';

const SITUACOES = ['teste', 'ativa', 'inadimplente', 'cancelada'] as const;
const TOM_DA_ASSINATURA = {
  teste: 'info',
  ativa: 'sucesso',
  inadimplente: 'alerta',
  cancelada: 'neutro',
} as const;

function useErro() {
  const tv = useTranslations('validacao');
  return (campo: FieldError | undefined) => campo && tv(chaveValidacao(campo.type));
}

/** Escritórios da plataforma (HU39): plano, assinatura, suspensão e acesso de suporte. */
export function Tenants() {
  const t = useTranslations('admin.tenants');
  const tenants = useTenants();
  const colunas: ColunaTabela<TenantAdministrado>[] = [
    { id: 'nome', header: t('colunas.nome'), cell: ({ row }) => row.original.nome },
    { id: 'tipo', header: t('colunas.tipo'), cell: ({ row }) => t(`tipos.${row.original.tipo}`) },
    {
      id: 'plano',
      header: t('colunas.plano'),
      cell: ({ row }) => row.original.plano ?? <span className="text-texto-suave">—</span>,
    },
    {
      id: 'assinatura',
      header: t('colunas.assinatura'),
      cell: ({ row }) => (
        <SeloStatus tom={TOM_DA_ASSINATURA[row.original.situacaoAssinatura]}>
          {t(`situacoes.${row.original.situacaoAssinatura}`)}
        </SeloStatus>
      ),
    },
    {
      id: 'acesso',
      header: t('colunas.acesso'),
      cell: ({ row }) => <Acesso tenant={row.original} />,
    },
    {
      id: 'criadoEm',
      header: t('colunas.criadoEm'),
      cell: ({ row }) => formatarInstante(row.original.criadoEm),
    },
    {
      id: 'acoes',
      header: t('colunas.acoes'),
      cell: ({ row }) =>
        row.original.tipo === 'plataforma' || row.original.encerradoEm !== null ? null : (
          <Gerenciar tenant={row.original} />
        ),
    },
  ];
  if (tenants.data === undefined) return <EstadoCarregando />;
  return (
    <div className="space-y-4">
      <TabelaDados
        titulo={t('titulo')}
        colunas={colunas}
        dados={tenants.data.pages.flatMap((pagina) => pagina.itens)}
        idLinha={(tenant) => tenant.id}
        vazio={<EstadoVazio descricao={t('vazio')} />}
      />
      {tenants.hasNextPage ? (
        <Botao
          variante="secundaria"
          carregando={tenants.isFetchingNextPage}
          onClick={() => {
            void tenants.fetchNextPage();
          }}
        >
          {t('carregarMais')}
        </Botao>
      ) : null}
    </div>
  );
}

function Acesso({ tenant }: { tenant: TenantAdministrado }) {
  const t = useTranslations('admin.tenants');
  if (tenant.encerradoEm !== null) return <SeloStatus tom="neutro">{t('encerrado')}</SeloStatus>;
  if (tenant.suspensao === null) return <SeloStatus tom="sucesso">{t('liberado')}</SeloStatus>;
  return (
    <span className="space-y-1">
      <SeloStatus tom="perigo">{t('suspenso')}</SeloStatus>
      <span className="block text-xs text-texto-suave">
        {t('suspensoEm', { quando: formatarInstante(tenant.suspensao.em) })}
      </span>
    </span>
  );
}

function Gerenciar({ tenant }: { tenant: TenantAdministrado }) {
  const t = useTranslations('admin.tenants');
  return (
    <Dialogo
      gatilho={<Botao variante="secundaria">{t('gerenciar')}</Botao>}
      titulo={t('gerenciarTitulo', { nome: tenant.nome })}
    >
      <div className="space-y-6">
        <FormularioAssinatura tenant={tenant} />
        {tenant.suspensao === null ? (
          <FormularioMotivo acao="suspender" tenantId={tenant.id} />
        ) : (
          <Reativar tenant={tenant} />
        )}
        <SePermitido permissao="admin:impersonar">
          <FormularioMotivo acao="impersonar" tenantId={tenant.id} />
        </SePermitido>
      </div>
    </Dialogo>
  );
}

interface CamposDaAssinatura {
  plano: string;
  situacaoAssinatura: TenantAdministrado['situacaoAssinatura'];
}

function FormularioAssinatura({ tenant }: { tenant: TenantAdministrado }) {
  const t = useTranslations('admin.tenants');
  const alterar = useAlterarAssinatura();
  const { register, handleSubmit, setValue, control } = useForm<CamposDaAssinatura>({
    defaultValues: { plano: tenant.plano ?? '', situacaoAssinatura: tenant.situacaoAssinatura },
  });
  // useWatch em vez de watch(): compatível com o React Compiler.
  const situacao = useWatch({ control, name: 'situacaoAssinatura' });
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(evento) =>
        void handleSubmit(({ plano, situacaoAssinatura }) => {
          alterar.mutate(
            {
              tenantId: tenant.id,
              plano: plano.trim() === '' ? null : plano.trim(),
              situacaoAssinatura,
            },
            { onSuccess: () => avisar.sucesso(t('assinaturaSalva')) },
          );
        })(evento)
      }
    >
      <h3 className="font-medium">{t('assinatura')}</h3>
      <Campo rotulo={t('colunas.plano')} maxLength={80} {...register('plano')} />
      <Selecao
        rotulo={t('colunas.assinatura')}
        opcoes={SITUACOES.map((s) => ({ valor: s, rotulo: t(`situacoes.${s}`) }))}
        valor={situacao}
        aoMudar={(valor) => {
          setValue('situacaoAssinatura', valor as CamposDaAssinatura['situacaoAssinatura']);
        }}
      />
      <Botao type="submit" carregando={alterar.isPending} className="justify-self-end">
        {t('salvar')}
      </Botao>
    </form>
  );
}

function Reativar({ tenant }: { tenant: TenantAdministrado }) {
  const t = useTranslations('admin.tenants');
  const reativar = useReativarTenant();
  return (
    <div className="space-y-2">
      <h3 className="font-medium">{t('suspensao')}</h3>
      <p className="text-sm text-texto-suave">
        {t('motivoAtual', { motivo: tenant.suspensao?.motivo ?? '' })}
      </p>
      <Botao
        carregando={reativar.isPending}
        onClick={() => {
          reativar.mutate(tenant.id, { onSuccess: () => avisar.sucesso(t('reativado')) });
        }}
      >
        {t('reativar')}
      </Botao>
    </div>
  );
}

/**
 * Ações que exigem motivo auditado: suspender o acesso (só o acesso; captura e avisos seguem) e
 * acessar o escritório pelo suporte (só leitura, 60 min).
 */
function FormularioMotivo({
  acao,
  tenantId,
}: {
  acao: 'suspender' | 'impersonar';
  tenantId: string;
}) {
  const t = useTranslations('admin.tenants');
  const erro = useErro();
  const router = useRouter();
  const suspender = useSuspenderTenant();
  const impersonar = useImpersonar();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ motivo: string }>({ resolver: zodResolver(PedidoDeSuspensao.esquema) });
  const enviar = ({ motivo }: { motivo: string }) => {
    if (acao === 'suspender') {
      suspender.mutate(
        { tenantId, motivo },
        { onSuccess: () => avisar.sucesso(t('suspensoAviso')) },
      );
    } else {
      impersonar.mutate(
        { tenantId, motivo },
        {
          onSuccess: () => {
            router.push('/');
          },
        },
      );
    }
  };
  return (
    <form noValidate className="grid gap-3" onSubmit={(e) => void handleSubmit(enviar)(e)}>
      <h3 className="font-medium">{t(`${acao}.titulo`)}</h3>
      <p className="text-sm text-texto-suave">{t(`${acao}.explicacao`)}</p>
      <Campo
        rotulo={t('motivo')}
        ajuda={t('ajudaMotivo')}
        obrigatorio
        maxLength={500}
        erro={erro(errors.motivo)}
        {...register('motivo')}
      />
      <Botao
        type="submit"
        variante={acao === 'suspender' ? 'perigo' : 'primaria'}
        carregando={suspender.isPending || impersonar.isPending}
        className="justify-self-end"
      >
        {t(`${acao}.botao`)}
      </Botao>
    </form>
  );
}
