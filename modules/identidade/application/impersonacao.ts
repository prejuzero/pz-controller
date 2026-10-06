import { err, NaoEncontrado, ok } from '@pz/kernel';

import { iniciarImpersonacao } from '../domain/impersonacao.js';
import { expiracao } from '../domain/sessao.js';

import type { ArmazemDeSessoes, ContextoDeAcesso } from './portas.js';
import type { NoTenant } from './redefinicao.js';
import type { Impersonacao, Sessao } from '../domain/sessao.js';
import type { OrigemDaAuditoria, TipoDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type {
  Clock,
  Conflito,
  Instant,
  Proibido,
  Result,
  UnidadeDeTrabalho,
  Uuid,
  Validacao,
} from '@pz/kernel';

/** Tipo do tenant visível na transação (RLS: só o próprio). */
export interface RepositorioDeTenants<Transacao> {
  tipo(transacao: Transacao, tenantId: Uuid): Promise<string | undefined>;
}

export interface DependenciasDaImpersonacao<Transacao> {
  readonly sessoes: ArmazemDeSessoes;
  readonly unidade: UnidadeDeTrabalho<Transacao>;
  readonly tenants: RepositorioDeTenants<Transacao>;
  readonly trilha: TrilhaDeAuditoria<Transacao>;
  readonly noTenant: NoTenant;
  readonly relogio: Clock;
}

const naoEncontrado = () => new NaoEncontrado('tenant-inexistente', 'Tenant não encontrado.');

function serializada(sessao: Sessao, impersonacao: Impersonacao, encerradaEm?: Instant) {
  return {
    administradorId: sessao.usuarioId,
    tenantDeOrigem: sessao.tenantId,
    tenantAcessado: impersonacao.tenantId,
    motivo: impersonacao.motivo,
    iniciadaEm: impersonacao.iniciadaEm.paraIso(),
    expiraEm: impersonacao.expiraEm.paraIso(),
    ...(encerradaEm === undefined ? {} : { encerradaEm: encerradaEm.paraIso() }),
  };
}

/**
 * Registra o evento nos dois lados (HU07): no tenant acessado (o cliente vê quem entrou e por
 * quê) e no tenant plataforma (log do suporte). Cada registro na transação do seu tenant; o do
 * acessado vai primeiro e, no início, confere o tenant. Falha em qualquer um interrompe a operação antes
 * de a sessão mudar: nunca há acesso sem rastro.
 */
async function auditarNosDoisTenants<Transacao>(
  deps: DependenciasDaImpersonacao<Transacao>,
  tipo: TipoDeAuditoria,
  sessao: Sessao,
  impersonacao: Impersonacao,
  contexto: ContextoDeAcesso,
  encerradaEm?: Instant,
): Promise<Result<void, NaoEncontrado>> {
  const entrada = {
    tipo,
    entidade: 'impersonacao',
    entidadeId: impersonacao.id,
    depois: serializada(sessao, impersonacao, encerradaEm),
  };
  const origem: OrigemDaAuditoria = {
    canal: 'portal',
    usuarioId: sessao.usuarioId,
    ip: contexto.ip,
    userAgent: contexto.userAgent,
  };
  const noAcessado = await deps.noTenant(impersonacao.tenantId, () =>
    deps.unidade.executar(async (tx) => {
      if (encerradaEm === undefined) {
        // Tenant da plataforma não se impersona; inexistente responde igual (não revela ids).
        const tipoDoTenant = await deps.tenants.tipo(tx, impersonacao.tenantId);
        if (tipoDoTenant === undefined || tipoDoTenant === 'plataforma') {
          return err(naoEncontrado());
        }
      }
      await deps.trilha.registrar(tx, entrada, origem);
      return ok(undefined);
    }),
  );
  if (!noAcessado.ok) return noAcessado;
  await deps.noTenant(sessao.tenantId, () =>
    deps.unidade.executar((tx) => deps.trilha.registrar(tx, entrada, origem)),
  );
  return ok(undefined);
}

/**
 * Inicia a impersonação (HU07): motivo obrigatório, 60 min, só leitura. Quem pode é conferido
 * na API (`admin:impersonar`, só no tenant plataforma). A sessão continua no mesmo token.
 */
export class IniciarImpersonacao<Transacao> {
  constructor(private readonly deps: DependenciasDaImpersonacao<Transacao>) {}

  async executar(
    token: string,
    sessao: Sessao,
    entrada: { readonly tenantId: Uuid; readonly motivo: string },
    contexto: ContextoDeAcesso,
  ): Promise<Result<Sessao, Validacao | Proibido | Conflito | NaoEncontrado>> {
    const iniciada = iniciarImpersonacao(
      sessao,
      entrada.tenantId,
      entrada.motivo,
      this.deps.relogio,
    );
    if (!iniciada.ok) return iniciada;
    const impersonacao = iniciada.valor.impersonacao;
    if (impersonacao === undefined) throw new Error('impersonação não iniciada');
    const auditada = await auditarNosDoisTenants(
      this.deps,
      'identidade.impersonacao-iniciada',
      sessao,
      impersonacao,
      contexto,
    );
    if (!auditada.ok) return auditada;
    await this.deps.sessoes.gravar(token, iniciada.valor, expiracao(iniciada.valor));
    return ok(iniciada.valor);
  }
}

/**
 * Encerra a impersonação antes do prazo, com auditoria nos dois tenants. Sem impersonação em
 * curso (ou já vencida: o início registrou até quando valia) não faz nada.
 */
export class EncerrarImpersonacao<Transacao> {
  constructor(private readonly deps: DependenciasDaImpersonacao<Transacao>) {}

  async executar(token: string, sessao: Sessao, contexto: ContextoDeAcesso): Promise<Sessao> {
    const { impersonacao, ...semImpersonacao } = sessao;
    if (impersonacao === undefined) return sessao;
    await auditarNosDoisTenants(
      this.deps,
      'identidade.impersonacao-encerrada',
      sessao,
      impersonacao,
      contexto,
      this.deps.relogio.agora(),
    );
    await this.deps.sessoes.gravar(token, semImpersonacao, expiracao(semImpersonacao));
    return semImpersonacao;
  }
}
