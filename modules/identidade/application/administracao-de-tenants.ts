import { err, NaoEncontrado, ok } from '@pz/kernel';

import { alterarAssinatura, reativar, suspender } from '../domain/tenant-administrado.js';

import type { ArmazemDeSessoes, ContextoDeAcesso } from './portas.js';
import type { NoTenant } from './redefinicao.js';
import type { AlteracaoDeAssinatura, TenantAdministrado } from '../domain/tenant-administrado.js';
import type { OrigemDaAuditoria, TipoDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Conflito, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/**
 * Tenants para o administrador da plataforma (HU39). A listagem roda no tenant plataforma (o RLS
 * deixa a plataforma ler a linha de todos os tenants, nunca os dados de negócio); as alterações
 * rodam no tenant alterado, com auditoria na mesma transação.
 */
export interface RepositorioDeTenantsAdministrados<Transacao> {
  /** Do mais novo para o mais antigo; `apos` é o último id da página anterior. */
  listar(
    transacao: Transacao,
    pagina: { readonly limite: number; readonly apos?: Uuid },
  ): Promise<TenantAdministrado[]>;
  obter(transacao: Transacao, tenantId: Uuid): Promise<TenantAdministrado | undefined>;
  /** Grava plano, situação da assinatura e suspensão. */
  gravar(transacao: Transacao, tenant: TenantAdministrado): Promise<void>;
  usuarios(transacao: Transacao, tenantId: Uuid): Promise<Uuid[]>;
}

export interface DependenciasDaAdministracaoDeTenants<Transacao> {
  readonly unidade: UnidadeDeTrabalho<Transacao>;
  readonly tenants: RepositorioDeTenantsAdministrados<Transacao>;
  readonly trilha: TrilhaDeAuditoria<Transacao>;
  readonly noTenant: NoTenant;
  readonly sessoes: ArmazemDeSessoes;
  readonly relogio: Clock;
}

/** Quem age: o administrador, no tenant plataforma. */
export interface Administrador extends ContextoDeAcesso {
  readonly usuarioId: Uuid;
  readonly tenantId: Uuid;
}

export interface PaginaDeTenants {
  readonly itens: readonly TenantAdministrado[];
  readonly proximoCursor: Uuid | null;
}

const inexistente = () => new NaoEncontrado('tenant-inexistente', 'Tenant não encontrado.');

const paraTrilha = (t: TenantAdministrado) => ({
  plano: t.plano,
  situacaoAssinatura: t.situacaoAssinatura,
  suspensoEm: t.suspensao?.em.paraIso() ?? null,
  motivoSuspensao: t.suspensao?.motivo ?? null,
});

export class ListarTenants<Transacao> {
  constructor(private readonly deps: DependenciasDaAdministracaoDeTenants<Transacao>) {}

  async executar(pagina: {
    readonly limite: number;
    readonly apos?: Uuid;
  }): Promise<PaginaDeTenants> {
    const linhas = await this.deps.unidade.executar((tx) =>
      this.deps.tenants.listar(tx, { ...pagina, limite: pagina.limite + 1 }),
    );
    const itens = linhas.slice(0, pagina.limite);
    const ultimo = itens.at(-1);
    return {
      itens,
      proximoCursor: linhas.length > pagina.limite && ultimo !== undefined ? ultimo.id : null,
    };
  }
}

export class DetalharTenant<Transacao> {
  constructor(private readonly deps: DependenciasDaAdministracaoDeTenants<Transacao>) {}

  async executar(tenantId: Uuid): Promise<Result<TenantAdministrado, NaoEncontrado>> {
    const tenant = await this.deps.noTenant(tenantId, () =>
      this.deps.unidade.executar((tx) => this.deps.tenants.obter(tx, tenantId)),
    );
    return tenant === undefined || tenant.tipo === 'plataforma' ? err(inexistente()) : ok(tenant);
  }
}

/**
 * Altera no tenant alvo e registra a trilha nos dois lados, como a impersonação: no tenant
 * alterado (o escritório vê quem mudou e por quê) e no da plataforma (log do suporte). Sem
 * mudança (já suspenso, já ativo), não registra de novo.
 */
async function alterar<Transacao>(
  deps: DependenciasDaAdministracaoDeTenants<Transacao>,
  admin: Administrador,
  tenantId: Uuid,
  tipo: TipoDeAuditoria,
  mudar: (atual: TenantAdministrado) => Result<TenantAdministrado, NaoEncontrado | Conflito>,
): Promise<
  Result<
    { readonly tenant: TenantAdministrado; readonly usuarios: readonly Uuid[] },
    NaoEncontrado | Conflito
  >
> {
  const origem: OrigemDaAuditoria = {
    canal: 'portal',
    usuarioId: admin.usuarioId,
    ip: admin.ip,
    userAgent: admin.userAgent,
  };
  let entrada: Parameters<TrilhaDeAuditoria<Transacao>['registrar']>[1] | undefined;
  const r = await deps.noTenant(tenantId, () =>
    deps.unidade.executar(async (tx) => {
      const atual = await deps.tenants.obter(tx, tenantId);
      if (atual === undefined) return err(inexistente());
      const novo = mudar(atual);
      if (!novo.ok) return novo;
      if (novo.valor !== atual) {
        await deps.tenants.gravar(tx, novo.valor);
        entrada = {
          tipo,
          entidade: 'tenant',
          entidadeId: tenantId,
          antes: paraTrilha(atual),
          depois: paraTrilha(novo.valor),
        };
        await deps.trilha.registrar(tx, entrada, origem);
      }
      return ok({ tenant: novo.valor, usuarios: await deps.tenants.usuarios(tx, tenantId) });
    }),
  );
  const registrada = entrada;
  if (r.ok && registrada !== undefined) {
    await deps.noTenant(admin.tenantId, () =>
      deps.unidade.executar((tx) => deps.trilha.registrar(tx, registrada, origem)),
    );
  }
  return r;
}

export class AlterarAssinatura<Transacao> {
  constructor(private readonly deps: DependenciasDaAdministracaoDeTenants<Transacao>) {}

  async executar(
    admin: Administrador,
    tenantId: Uuid,
    alteracao: AlteracaoDeAssinatura,
  ): Promise<Result<TenantAdministrado, NaoEncontrado | Conflito>> {
    const r = await alterar(this.deps, admin, tenantId, 'identidade.assinatura-alterada', (t) =>
      alterarAssinatura(t, alteracao),
    );
    return r.ok ? ok(r.valor.tenant) : r;
  }
}

/**
 * Suspende o acesso: o login passa a ser recusado e as sessões abertas caem agora. Captura,
 * cálculo e avisos continuam. Repetir a suspensão derruba de novo as sessões (sem nova trilha).
 */
export class SuspenderTenant<Transacao> {
  constructor(private readonly deps: DependenciasDaAdministracaoDeTenants<Transacao>) {}

  async executar(
    admin: Administrador,
    tenantId: Uuid,
    motivo: string,
  ): Promise<Result<TenantAdministrado, NaoEncontrado | Conflito>> {
    const agora = this.deps.relogio.agora();
    const r = await alterar(this.deps, admin, tenantId, 'identidade.tenant-suspenso', (t) =>
      suspender(t, motivo, agora),
    );
    if (!r.ok) return r;
    for (const usuarioId of r.valor.usuarios) {
      await this.deps.sessoes.removerTodasDoUsuario(usuarioId);
    }
    return ok(r.valor.tenant);
  }
}

export class ReativarTenant<Transacao> {
  constructor(private readonly deps: DependenciasDaAdministracaoDeTenants<Transacao>) {}

  async executar(
    admin: Administrador,
    tenantId: Uuid,
  ): Promise<Result<TenantAdministrado, NaoEncontrado | Conflito>> {
    const r = await alterar(this.deps, admin, tenantId, 'identidade.tenant-reativado', reativar);
    return r.ok ? ok(r.valor.tenant) : r;
  }
}
