import { Instant } from '@pz/kernel';

import type { RepositorioDeTenantsAdministrados } from '../application/administracao-de-tenants.js';
import type { RepositorioDeTenants } from '../application/impersonacao.js';
import type { TenantAdministrado } from '../domain/tenant-administrado.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

const CAMPOS = {
  id: true,
  nome: true,
  tipo: true,
  plano: true,
  situacaoAssinatura: true,
  suspensoEm: true,
  motivoSuspensao: true,
  encerradoEm: true,
  criadoEm: true,
} as const;

type Linha = Awaited<ReturnType<Transacao['tenant']['findFirstOrThrow']>>;

const instante = (data: Date) => Instant.deEpochMs(data.getTime());

function paraDominio(t: Pick<Linha, keyof typeof CAMPOS>): TenantAdministrado {
  return {
    id: t.id as Uuid,
    nome: t.nome,
    tipo: t.tipo,
    plano: t.plano,
    situacaoAssinatura: t.situacaoAssinatura,
    criadoEm: instante(t.criadoEm),
    ...(t.suspensoEm === null || t.motivoSuspensao === null
      ? {}
      : { suspensao: { em: instante(t.suspensoEm), motivo: t.motivoSuspensao } }),
    ...(t.encerradoEm === null ? {} : { encerradoEm: instante(t.encerradoEm) }),
  };
}

/**
 * Tenants no PostgreSQL. No tenant da transação o RLS mostra só o próprio; no tenant plataforma,
 * a política `plataforma_le_tenants` mostra a linha de todos (só leitura, HU39).
 */
export class TenantsPostgres
  implements RepositorioDeTenants<Transacao>, RepositorioDeTenantsAdministrados<Transacao>
{
  async tipo(tx: Transacao, tenantId: Uuid): Promise<string | undefined> {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { tipo: true } });
    return tenant?.tipo;
  }

  async listar(
    tx: Transacao,
    pagina: { readonly limite: number; readonly apos?: Uuid },
  ): Promise<TenantAdministrado[]> {
    const linhas = await tx.tenant.findMany({
      ...(pagina.apos === undefined ? {} : { where: { id: { lt: pagina.apos } } }),
      orderBy: { id: 'desc' },
      take: pagina.limite,
      select: CAMPOS,
    });
    return linhas.map(paraDominio);
  }

  async obter(tx: Transacao, tenantId: Uuid): Promise<TenantAdministrado | undefined> {
    const linha = await tx.tenant.findUnique({ where: { id: tenantId }, select: CAMPOS });
    return linha === null ? undefined : paraDominio(linha);
  }

  async gravar(tx: Transacao, tenant: TenantAdministrado): Promise<void> {
    await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        plano: tenant.plano,
        situacaoAssinatura: tenant.situacaoAssinatura,
        suspensoEm: tenant.suspensao === undefined ? null : new Date(tenant.suspensao.em.epochMs),
        motivoSuspensao: tenant.suspensao?.motivo ?? null,
      },
    });
  }

  async usuarios(tx: Transacao, tenantId: Uuid): Promise<Uuid[]> {
    const linhas = await tx.usuario.findMany({ where: { tenantId }, select: { id: true } });
    return linhas.map((u) => u.id as Uuid);
  }
}
