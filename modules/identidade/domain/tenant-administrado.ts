import { Conflito, err, NaoEncontrado, ok } from '@pz/kernel';

import type { Instant, Result, Uuid } from '@pz/kernel';

/**
 * Tenant visto pelo administrador da plataforma (HU39). Plano e situação da assinatura são
 * manuais no MVP (o gateway de cobrança entra pela porta `ProvedorCobranca`). A suspensão só
 * bloqueia o acesso ao portal e à API: captura, cálculo e avisos de prazo continuam (decisão do
 * PO em 08/10/2026; promessa de nenhum prazo perdido).
 */
export const SITUACOES_DE_ASSINATURA = ['teste', 'ativa', 'inadimplente', 'cancelada'] as const;
export type SituacaoDeAssinatura = (typeof SITUACOES_DE_ASSINATURA)[number];

export interface Suspensao {
  readonly em: Instant;
  readonly motivo: string;
}

export interface TenantAdministrado {
  readonly id: Uuid;
  readonly nome: string;
  readonly tipo: 'autonomo' | 'escritorio' | 'plataforma';
  readonly plano: string | null;
  readonly situacaoAssinatura: SituacaoDeAssinatura;
  readonly suspensao?: Suspensao;
  readonly encerradoEm?: Instant;
  readonly criadoEm: Instant;
}

export interface AlteracaoDeAssinatura {
  readonly plano?: string | null;
  readonly situacaoAssinatura?: SituacaoDeAssinatura;
}

// Igual à impersonação: o tenant da plataforma responde como inexistente (não se administra).
const inexistente = () => new NaoEncontrado('tenant-inexistente', 'Tenant não encontrado.');
const encerrado = () => new Conflito('tenant-encerrado', 'A conta do escritório foi encerrada.');

function administravel(tenant: TenantAdministrado): Result<void, NaoEncontrado | Conflito> {
  if (tenant.tipo === 'plataforma') return err(inexistente());
  if (tenant.encerradoEm !== undefined) return err(encerrado());
  return ok(undefined);
}

/** Já suspenso: devolve o mesmo tenant (idempotente; o motivo original fica). */
export function suspender(
  tenant: TenantAdministrado,
  motivo: string,
  agora: Instant,
): Result<TenantAdministrado, NaoEncontrado | Conflito> {
  const pode = administravel(tenant);
  if (!pode.ok) return pode;
  if (tenant.suspensao !== undefined) return ok(tenant);
  return ok({ ...tenant, suspensao: { em: agora, motivo } });
}

/** Não suspenso: devolve o mesmo tenant. Encerrado nunca está suspenso, então não é barrado. */
export function reativar(tenant: TenantAdministrado): Result<TenantAdministrado, NaoEncontrado> {
  if (tenant.tipo === 'plataforma') return err(inexistente());
  if (tenant.suspensao === undefined) return ok(tenant);
  const semSuspensao = { ...tenant };
  delete semSuspensao.suspensao;
  return ok(semSuspensao);
}

export function alterarAssinatura(
  tenant: TenantAdministrado,
  alteracao: AlteracaoDeAssinatura,
): Result<TenantAdministrado, NaoEncontrado | Conflito> {
  const pode = administravel(tenant);
  if (!pode.ok) return pode;
  return ok({ ...tenant, ...alteracao });
}
