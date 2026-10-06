import { randomBytes } from 'node:crypto';

import { Banco, BancoSistema, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { RedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  RegistrarDispositivo,
  RenovarTokens,
  RevogarDispositivo,
} from '../application/dispositivos.js';
import {
  AtivarSegundoFator,
  ConfigurarSegundoFator,
  VerificarSegundoFator,
} from '../application/segundo-fator.js';
import {
  Autenticar,
  ProtecaoDeAcesso,
  RegistrarCredencial,
  ValidarSessao,
} from '../application/sessoes.js';

import { AcessosPostgres } from './acessos-postgres.js';
import { HasherArgon2 } from './argon2.js';
import { CredenciaisPostgres } from './credenciais-postgres.js';
import { DispositivosPostgres, RenovacoesRedis } from './dispositivos.js';
import {
  EmailsDosUsuariosPostgres,
  noTenantDoBanco,
  PublicadorOutbox,
  RedefinicoesRedis,
} from './redefinicao.js';
import { SegundoFatorPostgres } from './segundo-fator-postgres.js';
import { CifraAesGcm, SegredosTotp } from './segundo-fator.js';
import { SessoesRedis } from './sessoes-redis.js';
import { TentativasRedis } from './tentativas-redis.js';
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
const CTX = { ip: '203.0.113.7', userAgent: 'teste' };
const protecao = () =>
  new ProtecaoDeAcesso(new TentativasRedis(redis), new AcessosPostgres(banco), relogio);

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
      segundoFatorAtivo: false,
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
      protecao(),
    );

    expect(
      (await executarNoTenant(TENANT_A, () => registrar.executar(ANA, 'uma senha bem longa'))).ok,
    ).toBe(true);
    const login = await autenticar.executar(
      {
        email: 'ANA@exemplo.invalid',
        senha: 'uma senha bem longa',
      },
      CTX,
    );
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
      (
        await autenticar.executar(
          { email: 'ana@exemplo.invalid', senha: 'senha errada longa' },
          CTX,
        )
      ).ok,
    ).toBe(false);

    await executarNoTenant(TENANT_A, () => registrar.executar(ANA, 'outra senha bem longa'));
    expect((await validar.executar(login.valor.token)).ok).toBe(false);
  });
});

describe('2FA no PostgreSQL (HU06)', () => {
  it('ativa com o segredo cifrado, o login passa a pedir verificação, passo e código de recuperação valem uma vez', async () => {
    const repositorio = new SegundoFatorPostgres(banco);
    const segredos = new SegredosTotp();
    const cifra = new CifraAesGcm(randomBytes(32).toString('base64'));
    const sessao = {
      id: gerarUuidV7(),
      usuarioId: BIA,
      tenantId: TENANT_B,
      nivel: 'senha' as const,
      segundoFatorAtivo: false,
      criadaEm: relogio.agora(),
      ultimoUso: relogio.agora(),
    };
    const passo = Math.floor(relogio.agora().epochMs / 30_000);
    await executarNoTenant(TENANT_B, async () => {
      const configurado = await new ConfigurarSegundoFator(repositorio, segredos, cifra).executar(
        sessao,
      );
      if (!configurado.ok) throw new Error('configurar deveria passar');
      const { segredo } = configurado.valor;
      const ativado = await new AtivarSegundoFator(repositorio, segredos, cifra, relogio).executar(
        sessao,
        segredos.codigo(segredo, passo),
      );
      if (!ativado.ok) throw new Error('ativar deveria passar');

      const verificar = new VerificarSegundoFator(
        repositorio,
        segredos,
        cifra,
        relogio,
        protecao(),
      );
      expect((await verificar.executar(sessao, segredos.codigo(segredo, passo), CTX)).ok).toBe(
        false,
      );
      const proximo = segredos.codigo(segredo, passo + 1);
      const [a, b] = await Promise.all([
        verificar.executar(sessao, proximo, CTX),
        verificar.executar(sessao, proximo, CTX),
      ]);
      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1); // o mesmo código em paralelo: só um passa
      const [codigo] = ativado.valor.codigosDeRecuperacao;
      expect((await verificar.executar(sessao, String(codigo), CTX)).ok).toBe(true);
      expect((await verificar.executar(sessao, String(codigo), CTX)).ok).toBe(false);
    });
    expect(
      (await new CredenciaisPostgres(banco).localizarPorEmail('bia@exemplo.invalid' as Email))
        ?.segundoFatorAtivo,
    ).toBe(true);
    // O segredo não fica em claro no banco.
    const direto = await postgres.conectar('pz_sistema');
    const { rows } = await direto.query<{ segredo: string }>(
      'SELECT totp_segredo_cifrado AS segredo FROM usuario WHERE id = $1',
      [BIA],
    );
    await direto.end();
    expect(rows[0]?.segredo).toMatch(/^v1\./);
  });
});

describe('registro de acessos e bloqueio com PostgreSQL e Redis', () => {
  it('cada tentativa vira acesso no tenant do usuário; os últimos acessos só aparecem no próprio tenant', async () => {
    const acessos = new AcessosPostgres(banco);
    const antes = (await executarNoTenant(TENANT_A, () => acessos.ultimos(ANA, 100))).length;
    const autenticar = new Autenticar(
      new CredenciaisPostgres(banco),
      new HasherArgon2(),
      new SessoesRedis(redis),
      new GeradorDeTokensSeguro(),
      relogio,
      protecao(),
    );
    await autenticar.executar({ email: 'ana@exemplo.invalid', senha: 'errada mas longa' }, CTX);
    const ultimos = await executarNoTenant(TENANT_A, () => acessos.ultimos(ANA, 100));
    expect(ultimos).toHaveLength(antes + 1);
    expect(ultimos[0]).toMatchObject({
      tipo: 'login',
      sucesso: false,
      ip: CTX.ip,
      tenantId: TENANT_A,
    });
    expect(await executarNoTenant(TENANT_B, () => acessos.ultimos(ANA, 100))).toEqual([]);
  });

  it('o contador e o bloqueio no Redis valem para todas as instâncias e expiram sozinhos', async () => {
    const [a, b] = [new TentativasRedis(redis), new TentativasRedis(redis)];
    expect(await a.registrarFalha('login:x')).toBe(1);
    expect(await b.registrarFalha('login:x')).toBe(2);
    expect(await redis.pttl('pz:tentativas:falhas:login:x')).toBeGreaterThan(23 * 3600 * 1000);
    const ate = Instant.deEpochMs(Date.now() + 60_000);
    await a.bloquear('login:x', ate);
    expect((await b.bloqueadoAte('login:x'))?.epochMs).toBe(ate.epochMs);
    expect(await redis.pttl('pz:tentativas:bloqueio:login:x')).toBeLessThanOrEqual(60_000);
    await b.limpar('login:x');
    expect(await a.bloqueadoAte('login:x')).toBeUndefined();
  });
});

describe('redefinição de senha com Redis e PostgreSQL (HU06)', () => {
  it('token de uso único com TTL, só o hash no Redis; um novo pedido invalida o anterior', async () => {
    const redefinicoes = new RedefinicoesRedis(redis);
    const pedido = { usuarioId: ANA, tenantId: TENANT_A, email: 'ana@exemplo.invalid' as Email };
    const ate = Instant.deEpochMs(Date.now() + 30 * 60_000);
    await redefinicoes.guardar('token-a-com-tamanho-suficiente', pedido, ate);
    expect(await redis.exists('pz:redefinicao:token-a-com-tamanho-suficiente')).toBe(0);
    await redefinicoes.guardar('token-b-com-tamanho-suficiente', pedido, ate);
    expect(await redefinicoes.consumir('token-a-com-tamanho-suficiente')).toBeUndefined();
    expect(await redefinicoes.consumir('token-b-com-tamanho-suficiente')).toEqual(pedido);
    expect(await redefinicoes.consumir('token-b-com-tamanho-suficiente')).toBeUndefined();
  });

  it('o evento vai para o outbox do tenant do usuário e o e-mail é lido sob RLS', async () => {
    const evento = {
      id: gerarUuidV7(),
      tipo: 'RedefinicaoDeSenhaSolicitada',
      versao: 1,
      tenantId: TENANT_B,
      agregadoId: BIA,
      ocorridoEm: relogio.agora(),
      payload: { usuarioId: BIA, tokenCifrado: 'v1.x.y.z' },
    };
    await new PublicadorOutbox(banco).publicar(TENANT_B, [evento]);
    const direto = await postgres.conectar('pz_sistema');
    const { rows } = await direto.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM evento_dominio WHERE id = $1',
      [evento.id],
    );
    await direto.end();
    expect(rows).toEqual([{ tenant_id: TENANT_B }]);
    const emails = new EmailsDosUsuariosPostgres();
    expect(
      await executarNoTenant(TENANT_B, () => banco.executar((tx) => emails.emailDe(tx, BIA))),
    ).toBe('Bia@Exemplo.invalid');
    expect(
      await executarNoTenant(TENANT_A, () => banco.executar((tx) => emails.emailDe(tx, BIA))),
    ).toBeUndefined();
  });
});

describe('sessões por dispositivo com PostgreSQL e Redis (HU06)', () => {
  it('rotação, reuso e revogação ponta a ponta; o dispositivo só existe no tenant do usuário', async () => {
    const dispositivos = new DispositivosPostgres(banco);
    const sessoes = new SessoesRedis(redis);
    const renovacoes = new RenovacoesRedis(redis);
    const publicador = new PublicadorOutbox(banco);
    const tokens = new GeradorDeTokensSeguro();
    const sessao = {
      id: gerarUuidV7(),
      usuarioId: ANA,
      tenantId: TENANT_A,
      nivel: 'completo' as const,
      segundoFatorAtivo: true,
      criadaEm: relogio.agora(),
      ultimoUso: relogio.agora(),
    };
    const emitidos = await executarNoTenant(TENANT_A, () =>
      new RegistrarDispositivo(
        dispositivos,
        sessoes,
        renovacoes,
        tokens,
        publicador,
        relogio,
      ).executar(sessao, { tipoCliente: 'mobile', nome: 'Celular' }),
    );
    expect(await redis.exists(`pz:renovacao:${emitidos.tokenDeRenovacao}`)).toBe(0); // só o hash
    expect(await executarNoTenant(TENANT_B, () => dispositivos.listar(ANA))).toEqual([]);

    const renovar = new RenovarTokens(
      dispositivos,
      sessoes,
      renovacoes,
      tokens,
      publicador,
      relogio,
      noTenantDoBanco,
    );
    const segundo = await renovar.executar(emitidos.tokenDeRenovacao);
    if (!segundo.ok) throw new Error('renovar deveria passar');
    expect((await renovar.executar(emitidos.tokenDeRenovacao)).ok).toBe(false); // reuso
    expect(
      (await new ValidarSessao(sessoes, relogio).executar(segundo.valor.tokenDeAcesso)).ok,
    ).toBe(false);
    const [registro] = await executarNoTenant(TENANT_A, () => dispositivos.listar(ANA));
    expect(registro?.revogadaEm).toBeDefined();

    const terceiro = await executarNoTenant(TENANT_A, () =>
      new RegistrarDispositivo(
        dispositivos,
        sessoes,
        renovacoes,
        tokens,
        publicador,
        relogio,
      ).executar(sessao, { tipoCliente: 'mcp', nome: 'Assistente' }),
    );
    const revogar = new RevogarDispositivo(dispositivos, sessoes, renovacoes, publicador, relogio);
    expect(
      (
        await executarNoTenant(TENANT_B, () =>
          revogar.executar({ ...sessao, tenantId: TENANT_B }, terceiro.dispositivoId),
        )
      ).ok,
    ).toBe(false);
    expect(
      (await executarNoTenant(TENANT_A, () => revogar.executar(sessao, terceiro.dispositivoId))).ok,
    ).toBe(true);
    expect((await renovar.executar(terceiro.tokenDeRenovacao)).ok).toBe(false);
  });
});
