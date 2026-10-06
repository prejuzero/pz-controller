import { Banco, BancoSistema, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { RedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Autenticar, RegistrarCredencial, ValidarSessao } from '../application/sessoes.js';

import { HasherArgon2 } from './argon2.js';
import { CredenciaisPostgres } from './credenciais-postgres.js';
import { SessoesRedis } from './sessoes-redis.js';
import { GeradorDeTokensSeguro, hashDoToken } from './tokens.js';

import type { Email } from '../domain/credenciais.js';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';
import type { StartedRedisContainer } from '@testcontainers/redis';

// Dados fictícios de teste.
const TENANT_A = '01a10e00-0000-7000-8000-0000000d0a01' as Uuid;
const TENANT_B = '01a10e00-0000-7000-8000-0000000d0b01' as Uuid;
const ANA = '01a10e00-0000-7000-8000-0000000d0a02' as Uuid;
const BIA = '01a10e00-0000-7000-8000-0000000d0b02' as Uuid;
const relogio = new FixedClock(Instant.deIso('2026-10-06T12:00:00Z'));

let postgres: BancoDeTeste;
let conteinerRedis: StartedRedisContainer;
let banco: Banco;
let redis: Redis;

beforeAll(async () => {
  [postgres, conteinerRedis] = await Promise.all([
    subirBancoDeTeste(),
    new RedisContainer('redis:8.6.7-alpine').start(),
  ]);
  await postgres.migrar();
  const sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar usuários de teste', async (tx) => {
    await tx.tenant.createMany({
      data: [
        { id: TENANT_A, nome: 'Escritório A', tipo: 'escritorio' },
        { id: TENANT_B, nome: 'Escritório B', tipo: 'escritorio' },
      ],
    });
    await tx.usuario.createMany({
      data: [
        { id: ANA, tenantId: TENANT_A, nome: 'Ana', email: 'ana@exemplo.invalid' },
        { id: BIA, tenantId: TENANT_B, nome: 'Bia', email: 'Bia@Exemplo.invalid' },
      ],
    });
  });
  await sistema.encerrar();
  banco = new Banco({ url: postgres.url('pz_app') });
  redis = new Redis(conteinerRedis.getConnectionUrl());
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  redis.disconnect();
  await Promise.all([postgres.parar(), conteinerRedis.stop()]);
});

describe('credenciais no PostgreSQL (HU06)', () => {
  const credenciais = () => new CredenciaisPostgres(banco);

  it('o login localiza o usuário de qualquer tenant pelo e-mail, sem diferenciar maiúsculas', async () => {
    expect(await credenciais().localizarPorEmail('bia@exemplo.invalid' as Email)).toEqual({
      usuarioId: BIA,
      tenantId: TENANT_B,
      senhaHash: null,
    });
    expect(
      await credenciais().localizarPorEmail('ninguem@exemplo.invalid' as Email),
    ).toBeUndefined();
  });

  it('o e-mail é único no sistema, mesmo em outro tenant e com outra caixa', async () => {
    await expect(
      executarNoTenant(TENANT_B, () =>
        banco.executar((tx) =>
          tx.usuario.create({
            data: {
              id: gerarUuidV7(),
              tenantId: TENANT_B,
              nome: 'Cópia',
              email: 'ANA@exemplo.invalid',
            },
          }),
        ),
      ),
    ).rejects.toThrow(/usuario_email_global_key|Unique constraint/);
  });

  it('a api (pz_app) só executa a função: ler usuario sem tenant continua bloqueado pelo RLS', async () => {
    expect(await banco.executarSemTenant('teste', (tx) => tx.usuario.count())).toBe(0);
    const direto = await postgres.conectar('pz_app');
    await expect(
      direto.query('ALTER FUNCTION pz_localizar_credencial(text) OWNER TO pz_app'),
    ).rejects.toThrow();
    await direto.end();
  });

  it('definir senha só alcança o usuário do tenant do contexto', async () => {
    // O RLS esconde o usuário do outro tenant: a atualização falha em vez de alcançá-lo.
    await expect(
      executarNoTenant(TENANT_A, () => credenciais().definirSenha(BIA, 'hash-invasor')),
    ).rejects.toThrow();
    expect(
      (await credenciais().localizarPorEmail('bia@exemplo.invalid' as Email))?.senhaHash,
    ).toBeNull();
  });
});

describe('login ponta a ponta com Argon2id, PostgreSQL e Redis', () => {
  it('registra a senha, entra, valida a sessão no Redis (só o hash do token) e revoga ao trocar a senha', async () => {
    const credenciais = new CredenciaisPostgres(banco);
    const hasher = new HasherArgon2();
    const sessoes = new SessoesRedis(redis);
    const registrar = new RegistrarCredencial(credenciais, hasher, sessoes);
    const autenticar = new Autenticar(
      credenciais,
      hasher,
      sessoes,
      new GeradorDeTokensSeguro(),
      relogio,
    );

    expect(
      (await executarNoTenant(TENANT_A, () => registrar.executar(ANA, 'uma senha bem longa'))).ok,
    ).toBe(true);
    const login = await autenticar.executar({
      email: 'ANA@exemplo.invalid',
      senha: 'uma senha bem longa',
    });
    if (!login.ok) throw new Error('login deveria passar');
    expect(login.valor.sessao).toMatchObject({
      usuarioId: ANA,
      tenantId: TENANT_A,
      nivel: 'senha',
    });

    expect(await redis.exists(`pz:sessao:${login.valor.token}`)).toBe(0);
    expect(await redis.exists(`pz:sessao:${hashDoToken(login.valor.token)}`)).toBe(1);
    expect(await redis.pttl(`pz:sessao:${hashDoToken(login.valor.token)}`)).toBeGreaterThan(
      11 * 3600 * 1000,
    );

    const validar = new ValidarSessao(sessoes, relogio);
    expect((await validar.executar(login.valor.token)).ok).toBe(true);
    expect(
      (await autenticar.executar({ email: 'ana@exemplo.invalid', senha: 'senha errada longa' })).ok,
    ).toBe(false);

    await executarNoTenant(TENANT_A, () => registrar.executar(ANA, 'outra senha bem longa'));
    expect((await validar.executar(login.valor.token)).ok).toBe(false);
  });
});
