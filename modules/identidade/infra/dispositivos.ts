import { Instant } from '@pz/kernel';

import { hashDoToken } from './tokens.js';

import type { ArmazemDeCodigos, DadosDoCodigo } from '../application/autorizacao-oauth.js';
import type {
  ArmazemDeRenovacoes,
  DadosDaRenovacao,
  Dispositivo,
  RepositorioDeDispositivos,
  ResultadoDaRenovacao,
} from '../application/portas.js';
import type { Banco } from '@pz/db';
import type { Uuid } from '@pz/kernel';
import type { Redis } from 'ioredis';

/** Sessões de dispositivo no PostgreSQL (tabela `sessao_dispositivo`, RLS por tenant). */
export class DispositivosPostgres implements RepositorioDeDispositivos {
  constructor(private readonly banco: Banco) {}

  async registrar(d: Dispositivo): Promise<void> {
    await this.banco.executar((tx) =>
      tx.sessaoDispositivo.create({
        data: {
          id: d.id,
          tenantId: d.tenantId,
          usuarioId: d.usuarioId,
          tipoCliente: d.tipoCliente,
          nomeDispositivo: d.nome,
          criadoEm: new Date(d.criadoEm.epochMs),
          ultimoUso: new Date(d.ultimoUso.epochMs),
          clienteOauthId: d.clienteOAuthId ?? null,
        },
      }),
    );
  }

  async listar(usuarioId: Uuid): Promise<Dispositivo[]> {
    const linhas = await this.banco.executar((tx) =>
      tx.sessaoDispositivo.findMany({
        where: { usuarioId },
        orderBy: [{ ultimoUso: 'desc' }, { id: 'desc' }],
      }),
    );
    return linhas.map((l) => ({
      id: l.id as Uuid,
      usuarioId: l.usuarioId as Uuid,
      tenantId: l.tenantId as Uuid,
      tipoCliente: l.tipoCliente,
      nome: l.nomeDispositivo,
      criadoEm: Instant.deEpochMs(l.criadoEm.getTime()),
      ultimoUso: Instant.deEpochMs(l.ultimoUso.getTime()),
      ...(l.revogadaEm === null ? {} : { revogadaEm: Instant.deEpochMs(l.revogadaEm.getTime()) }),
      ...(l.clienteOauthId === null ? {} : { clienteOAuthId: l.clienteOauthId as Uuid }),
    }));
  }

  async ativo(id: Uuid, usuarioId: Uuid): Promise<boolean> {
    return (
      (await this.banco.executar((tx) =>
        // Escritório suspenso (HU39) não renova tokens do app: o acesso volta só ao reativar.
        tx.sessaoDispositivo.count({
          where: { id, usuarioId, revogadaEm: null, tenant: { suspensoEm: null } },
        }),
      )) === 1
    );
  }

  async registrarUso(id: Uuid, em: Instant): Promise<void> {
    await this.banco.executar((tx) =>
      tx.sessaoDispositivo.updateMany({ where: { id }, data: { ultimoUso: new Date(em.epochMs) } }),
    );
  }

  async revogar(id: Uuid, usuarioId: Uuid, em: Instant): Promise<boolean> {
    const { count } = await this.banco.executar((tx) =>
      tx.sessaoDispositivo.updateMany({
        where: { id, usuarioId, revogadaEm: null },
        data: { revogadaEm: new Date(em.epochMs) },
      }),
    );
    return count === 1;
  }

  async revogarDoCliente(clienteOAuthId: Uuid, em: Instant): Promise<Uuid[]> {
    return this.banco.executar(async (tx) => {
      const abertos = await tx.sessaoDispositivo.findMany({
        where: { clienteOauthId: clienteOAuthId, revogadaEm: null },
        select: { id: true },
      });
      await tx.sessaoDispositivo.updateMany({
        where: { id: { in: abertos.map((a) => a.id) } },
        data: { revogadaEm: new Date(em.epochMs) },
      });
      return abertos.map((a) => a.id as Uuid);
    });
  }
}

/** Tokens de renovação no Redis: só o hash; uso único (GETDEL); os usados ficam marcados até expirar. */
export class RenovacoesRedis implements ArmazemDeRenovacoes {
  constructor(
    private readonly redis: Redis,
    private readonly prefixo = 'pz:renovacao:',
  ) {}

  async emitir(token: string, dados: DadosDaRenovacao, expiraEm: Instant): Promise<void> {
    const hash = hashDoToken(token);
    const doDispositivo = `${this.prefixo}dispositivo:${dados.dispositivoId}`;
    await this.redis
      .multi()
      .set(`${this.prefixo}${hash}`, JSON.stringify(dados), 'PXAT', expiraEm.epochMs)
      .sadd(doDispositivo, hash)
      .pexpireat(doDispositivo, expiraEm.epochMs)
      .exec();
  }

  async consumir(token: string): Promise<ResultadoDaRenovacao> {
    const hash = hashDoToken(token);
    const bruto = await this.redis.getdel(`${this.prefixo}${hash}`);
    if (bruto !== null) {
      const dados = JSON.parse(bruto) as DadosDaRenovacao;
      const ttl = 30 * 24 * 3600 * 1000;
      await this.redis.set(`${this.prefixo}usado:${hash}`, bruto, 'PX', ttl);
      return { tipo: 'valido', dados };
    }
    const usado = await this.redis.get(`${this.prefixo}usado:${hash}`);
    return usado === null
      ? { tipo: 'invalido' }
      : { tipo: 'reuso', dados: JSON.parse(usado) as DadosDaRenovacao };
  }

  async revogarDoDispositivo(dispositivoId: Uuid): Promise<void> {
    const doDispositivo = `${this.prefixo}dispositivo:${dispositivoId}`;
    const hashes = await this.redis.smembers(doDispositivo);
    await this.redis.del(doDispositivo, ...hashes.map((h) => `${this.prefixo}${h}`));
  }
}

/** Códigos de autorização OAuth no Redis (HU49): só o hash, uso único (GETDEL), TTL curto. */
export class CodigosRedis implements ArmazemDeCodigos {
  constructor(
    private readonly redis: Redis,
    private readonly prefixo = 'pz:codigo-oauth:',
  ) {}

  async emitir(codigo: string, dados: DadosDoCodigo, expiraEm: Instant): Promise<void> {
    await this.redis.set(
      `${this.prefixo}${hashDoToken(codigo)}`,
      JSON.stringify(dados),
      'PXAT',
      expiraEm.epochMs,
    );
  }

  async consumir(codigo: string): Promise<DadosDoCodigo | undefined> {
    const bruto = await this.redis.getdel(`${this.prefixo}${hashDoToken(codigo)}`);
    return bruto === null ? undefined : (JSON.parse(bruto) as DadosDoCodigo);
  }
}
