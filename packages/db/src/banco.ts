import { PrismaPg } from '@prisma/adapter-pg';
import { criarLogger } from '@pz/observability';

import { PrismaClient } from './gerado/prisma/client.js';
import { SemTenant, tenantAtual } from './tenant.js';

import type { Prisma } from './gerado/prisma/client.js';
import type { UnidadeDeTrabalho } from '@pz/kernel';

/** Transação do Prisma: o único acesso a dados que os repositórios recebem. */
export type Transacao = Prisma.TransactionClient;

export interface OpcoesBanco {
  readonly url: string;
  /** Conexões no pool deste processo. */
  readonly maxConexoes?: number;
}

const logger = criarLogger('db');

function criarCliente(opcoes: OpcoesBanco): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: opcoes.url, max: opcoes.maxConexoes ?? 10 }),
  });
}

/**
 * Acesso a dados de negócio pelo papel pz_app (sem BYPASSRLS, ADR-003). Toda operação roda numa
 * transação que começa com `set_config('app.tenant_id', <tenant atual>, true)`: o RLS do banco
 * filtra o tenant, e o valor vale só até o fim da transação (compatível com PgBouncer em modo
 * transaction). Sem tenant no contexto, recusa com `SemTenant`.
 */
export class Banco implements UnidadeDeTrabalho<Transacao> {
  readonly #prisma: PrismaClient;

  constructor(opcoes: OpcoesBanco) {
    this.#prisma = criarCliente(opcoes);
  }

  executar<Resultado>(trabalho: (transacao: Transacao) => Promise<Resultado>): Promise<Resultado> {
    const tenantId = tenantAtual();
    if (tenantId === undefined) return Promise.reject(new SemTenant());
    return this.#prisma.$transaction(async (transacao) => {
      await transacao.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return trabalho(transacao);
    });
  }

  /** Confere a conexão no protocolo do PostgreSQL (prontidão). */
  async verificar(): Promise<void> {
    await this.#prisma.$queryRaw`SELECT 1`;
  }

  encerrar(): Promise<void> {
    return this.#prisma.$disconnect();
  }
}

/**
 * Acesso global pelo papel pz_sistema (BYPASSRLS): relay do outbox, cadastro de tenants, jobs
 * que atravessam tenants. Toda operação exige um motivo e é registrada (ADR-003); o registro
 * na trilha de auditoria imutável entra com o módulo de auditoria.
 */
export class BancoSistema {
  readonly #prisma: PrismaClient;

  constructor(opcoes: OpcoesBanco) {
    this.#prisma = criarCliente(opcoes);
  }

  executarComoSistema<Resultado>(
    motivo: string,
    trabalho: (transacao: Transacao) => Promise<Resultado>,
  ): Promise<Resultado> {
    if (motivo.trim().length === 0) {
      return Promise.reject(new Error('Operação do sistema (BYPASSRLS) exige um motivo.'));
    }
    logger.info({ motivo, acessoGlobal: true }, 'operação do sistema no banco');
    return this.#prisma.$transaction(trabalho);
  }

  /** Unidade de trabalho do sistema para um uso fixo (ex.: o relay do outbox). */
  unidade(motivo: string): UnidadeDeTrabalho<Transacao> {
    return { executar: (trabalho) => this.executarComoSistema(motivo, trabalho) };
  }

  encerrar(): Promise<void> {
    return this.#prisma.$disconnect();
  }
}
