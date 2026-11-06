import { randomBytes } from 'node:crypto';

import { TrilhaPostgres } from '@pz/auditoria';
import { Banco, BancoSistema, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { CifraVersionada, ProvedorChavesLocal } from '@pz/integracoes';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { RedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ListarTenants,
  ReativarTenant,
  SuspenderTenant,
} from '../application/administracao-de-tenants.js';
import { AutorizarCliente, TrocarCodigoPorTokens } from '../application/autorizacao-oauth.js';
import {
  EmitirTokenDeCliente,
  RegistrarClienteOAuth,
  RevogarClienteOAuth,
} from '../application/clientes-oauth.js';
import {
  RegistrarDispositivo,
  RenovarTokens,
  RevogarDispositivo,
} from '../application/dispositivos.js';
import { IniciarImpersonacao } from '../application/impersonacao.js';
import { RecifrarSegredosDoSegundoFator } from '../application/recifra.js';
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
import { PERFIS_PADRAO } from '../domain/perfis.js';
import { PERMISSOES } from '../domain/permissoes.js';

import { AcessosPostgres } from './acessos-postgres.js';
import { HasherArgon2 } from './argon2.js';
import { ClientesOAuthPostgres } from './clientes-oauth-postgres.js';
import { CredenciaisPostgres } from './credenciais-postgres.js';
import { CodigosRedis, DispositivosPostgres, RenovacoesRedis } from './dispositivos.js';
import { PerfisPostgres, UsuariosComPermissaoPostgres } from './perfis-postgres.js';
import {
  EmailsDoEscritorioPostgres,
  EmailsDosUsuariosPostgres,
  NomesDosUsuariosPostgres,
  noTenantDoBanco,
  PublicadorOutbox,
  RedefinicoesRedis,
} from './redefinicao.js';
import { SegredosDoSegundoFatorPostgres } from './segredos-postgres.js';
import { SegundoFatorPostgres } from './segundo-fator-postgres.js';
import { CifraAesGcm, SegredosTotp } from './segundo-fator.js';
import { SessoesRedis } from './sessoes-redis.js';
import { TenantsPostgres } from './tenants-postgres.js';
import { TentativasRedis } from './tentativas-redis.js';
import { desafioPkce, GeradorDeTokensSeguro, hashDoToken } from './tokens.js';

import type { ConsultarPermissoes } from '../application/autorizacao.js';
import type { Email } from '../domain/credenciais.js';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';
import type { StartedRedisContainer } from '@testcontainers/redis';

// Dados fictícios de teste.
const TENANT_A = '01a10e00-0000-7000-8000-0000000d0a01' as Uuid;
const TENANT_B = '01a10e00-0000-7000-8000-0000000d0b01' as Uuid;
const TENANT_P = '01a10e00-0000-7000-8000-0000000d0f01' as Uuid;
const ANA = '01a10e00-0000-7000-8000-0000000d0a02' as Uuid;
const BIA = '01a10e00-0000-7000-8000-0000000d0b02' as Uuid;
const SENHA_DA_BIA = 'senha ficticia da bia 2026';
// Fixo durante o teste, mas tirado da hora real: o Redis expira as chaves pelo próprio relógio
// (PXAT), e uma data fixa no passado faz o token de renovação (30 dias) vencer sozinho.
const relogio = new FixedClock(Instant.deEpochMs(Math.floor(Date.now() / 1000) * 1000));
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
        { id: TENANT_P, nome: 'Plataforma', tipo: 'plataforma' },
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
      tenantSuspenso: false,
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
    // Expiração absoluta (PXAT) no instante do bloqueio, sem depender do relógio do container.
    expect(await redis.pexpiretime('pz:tentativas:bloqueio:login:x')).toBe(ate.epochMs);
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
    const nomes = new NomesDosUsuariosPostgres();
    expect(
      await executarNoTenant(TENANT_B, () => banco.executar((tx) => nomes.nomeDe(tx, BIA))),
    ).toEqual(expect.any(String));
    expect(
      await executarNoTenant(TENANT_A, () => banco.executar((tx) => nomes.nomeDe(tx, BIA))),
    ).toBeUndefined();
    // Envio manual (HU32): só e-mail de usuário do próprio escritório conta como interno.
    const doEscritorio = new EmailsDoEscritorioPostgres();
    const pedidos = ['bia@exemplo.invalid', 'fora@exemplo.invalid'];
    expect([
      ...(await executarNoTenant(TENANT_B, () =>
        banco.executar((tx) => doEscritorio.internos(tx, pedidos)),
      )),
    ]).toEqual(['bia@exemplo.invalid']);
    expect(
      (
        await executarNoTenant(TENANT_A, () =>
          banco.executar((tx) => doEscritorio.internos(tx, pedidos)),
        )
      ).size,
    ).toBe(0);
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

describe('clientes OAuth com PostgreSQL e Redis (HU49)', () => {
  it('só o hash do segredo, token pela função restrita, RLS por tenant e revogação na hora', async () => {
    const clientes = new ClientesOAuthPostgres(banco);
    const sessoes = new SessoesRedis(redis);
    const publicador = new PublicadorOutbox(banco);
    const tokens = new GeradorDeTokensSeguro();
    const permissoes = {
      executar: () => Promise.resolve(new Set(['prazos:ler'])),
    } as unknown as ConsultarPermissoes;
    const sessao = {
      id: gerarUuidV7(),
      usuarioId: ANA,
      tenantId: TENANT_A,
      nivel: 'completo' as const,
      segundoFatorAtivo: true,
      criadaEm: relogio.agora(),
      ultimoUso: relogio.agora(),
    };
    const registrado = await executarNoTenant(TENANT_A, () =>
      new RegistrarClienteOAuth(clientes, permissoes, tokens, publicador, relogio).executar(
        sessao,
        { nome: 'ERP fictício', escopos: ['prazos:ler'] },
      ),
    );
    if (!registrado.ok) throw new Error('registrar deveria passar');
    const { cliente } = registrado.valor;
    const segredo = registrado.valor.segredo ?? '';
    const [gravado] = await executarNoTenant(TENANT_A, () =>
      banco.executar((tx) => tx.clienteOauth.findMany({ select: { segredoHash: true } })),
    );
    expect(gravado?.segredoHash).toBe(hashDoToken(segredo));
    expect(await executarNoTenant(TENANT_B, () => clientes.listar())).toEqual([]);
    // Sem tenant, a api (pz_app) só chega ao cliente pela função restrita.
    await expect(
      banco.executarSemTenant('teste: ler direto', (tx) => tx.clienteOauth.count()),
    ).resolves.toBe(0);

    const emitir = new EmitirTokenDeCliente(clientes, sessoes, tokens, relogio, noTenantDoBanco);
    expect((await emitir.executar({ clienteId: cliente.id, segredo: 'x'.repeat(43) })).ok).toBe(
      false,
    );
    const token = await emitir.executar({ clienteId: cliente.id, segredo });
    if (!token.ok) throw new Error('token deveria sair');
    const validada = await new ValidarSessao(sessoes, relogio).executar(token.valor.tokenDeAcesso);
    expect(validada.ok && validada.valor).toMatchObject({
      tenantId: TENANT_A,
      usuarioId: ANA,
      escopos: ['prazos:ler'],
    });
    const [usado] = await executarNoTenant(TENANT_A, () => clientes.listar());
    expect(usado?.ultimoUso).toEqual(relogio.agora());

    const revogar = new RevogarClienteOAuth(
      clientes,
      sessoes,
      new DispositivosPostgres(banco),
      new RenovacoesRedis(redis),
      publicador,
      relogio,
    );
    expect(
      (
        await executarNoTenant(TENANT_B, () =>
          revogar.executar({ ...sessao, tenantId: TENANT_B }, cliente.id),
        )
      ).ok,
    ).toBe(false);
    expect((await executarNoTenant(TENANT_A, () => revogar.executar(sessao, cliente.id))).ok).toBe(
      true,
    );
    expect((await new ValidarSessao(sessoes, relogio).executar(token.valor.tokenDeAcesso)).ok).toBe(
      false,
    );
    expect((await emitir.executar({ clienteId: cliente.id, segredo })).ok).toBe(false);
  });
});

describe('app público OAuth com PostgreSQL e Redis (HU49)', () => {
  it('código de uso único no Redis, sessão ligada ao app e revogação de tudo', async () => {
    const clientes = new ClientesOAuthPostgres(banco);
    const sessoes = new SessoesRedis(redis);
    const dispositivos = new DispositivosPostgres(banco);
    const renovacoes = new RenovacoesRedis(redis);
    const codigos = new CodigosRedis(redis);
    const publicador = new PublicadorOutbox(banco);
    const tokens = new GeradorDeTokensSeguro();
    const permissoes = {
      executar: () => Promise.resolve(new Set(['prazos:ler'])),
    } as unknown as ConsultarPermissoes;
    const sessao = {
      id: gerarUuidV7(),
      usuarioId: ANA,
      tenantId: TENANT_A,
      nivel: 'completo' as const,
      segundoFatorAtivo: true,
      criadaEm: relogio.agora(),
      ultimoUso: relogio.agora(),
    };
    const retorno = 'http://localhost:8765/retorno';
    const registrado = await executarNoTenant(TENANT_A, () =>
      new RegistrarClienteOAuth(clientes, permissoes, tokens, publicador, relogio).executar(
        sessao,
        {
          nome: 'Assistente fictício',
          escopos: ['prazos:ler'],
          tipo: 'publico',
          redirectUris: [retorno],
        },
      ),
    );
    if (!registrado.ok) throw new Error('registrar deveria passar');
    const { cliente } = registrado.valor;
    expect(registrado.valor.segredo).toBeNull();
    expect(await clientes.localizar(cliente.id)).toMatchObject({
      tipo: 'publico',
      redirectUris: [retorno],
    });
    expect(await clientes.autenticar(cliente.id, 'x'.repeat(43))).toBeUndefined();

    const verificador = 'v'.repeat(43);
    const autorizado = await executarNoTenant(TENANT_A, () =>
      new AutorizarCliente(clientes, permissoes, codigos, tokens, publicador, relogio).executar(
        sessao,
        {
          responseType: 'code',
          clienteId: cliente.id,
          redirectUri: retorno,
          desafio: desafioPkce(verificador),
          metodoDoDesafio: 'S256',
        },
      ),
    );
    if (!autorizado.ok) throw new Error('autorizar deveria passar');
    const codigo = new URL(autorizado.valor.redirecionarPara).searchParams.get('code') ?? '';
    expect(await redis.exists(`pz:codigo-oauth:${codigo}`)).toBe(0); // só o hash
    const trocar = new TrocarCodigoPorTokens(
      clientes,
      codigos,
      desafioPkce,
      dispositivos,
      sessoes,
      renovacoes,
      tokens,
      publicador,
      relogio,
      noTenantDoBanco,
    );
    const entrada = { codigo, clienteId: cliente.id, redirectUri: retorno, verificador };
    const emitidos = await trocar.executar(entrada);
    if (!emitidos.ok) throw new Error('troca deveria passar');
    expect((await trocar.executar(entrada)).ok).toBe(false);
    const doApp = (await executarNoTenant(TENANT_A, () => dispositivos.listar(ANA))).filter(
      (d) => d.clienteOAuthId === cliente.id,
    );
    expect(doApp).toHaveLength(1);

    const revogar = new RevogarClienteOAuth(
      clientes,
      sessoes,
      dispositivos,
      renovacoes,
      publicador,
      relogio,
    );
    expect((await executarNoTenant(TENANT_A, () => revogar.executar(sessao, cliente.id))).ok).toBe(
      true,
    );
    expect(
      (await new ValidarSessao(sessoes, relogio).executar(emitidos.valor.tokenDeAcesso)).ok,
    ).toBe(false);
    expect(await redis.exists(`pz:renovacao:${hashDoToken(emitidos.valor.tokenDeRenovacao)}`)).toBe(
      0,
    );
  });
});

describe('perfis e permissões no PostgreSQL (HU07)', () => {
  it('os perfis semeados pela migração são os do código e só usam permissões do catálogo', async () => {
    const migrador = await postgres.conectar('pz_migrator');
    try {
      const { rows } = await migrador.query<{ perfil: string; permissao: string }>(
        'SELECT perfil, permissao FROM perfil_permissao ORDER BY perfil, permissao',
      );
      const doBanco: Record<string, string[]> = {};
      for (const { perfil, permissao } of rows) (doBanco[perfil] ??= []).push(permissao);
      const doCodigo = Object.fromEntries(
        Object.entries(PERFIS_PADRAO).map(([perfil, lista]) => [perfil, [...lista].sort()]),
      );
      expect(doBanco).toEqual(doCodigo);
      expect(rows.every((r) => (PERMISSOES as readonly string[]).includes(r.permissao))).toBe(true);
    } finally {
      await migrador.end();
    }
  });

  it('permissões vêm dos perfis do usuário no tenant dele (RLS)', async () => {
    await executarNoTenant(TENANT_A, () =>
      banco.executar((tx) =>
        tx.usuarioPerfil.create({
          data: { tenantId: TENANT_A, usuarioId: ANA, perfil: 'colaborador' },
        }),
      ),
    );
    const perfis = new PerfisPostgres(banco);
    expect([...(await perfis.permissoesDoUsuario(TENANT_A, ANA))].sort()).toEqual(
      [...PERFIS_PADRAO.colaborador].sort(),
    );
    // Outro tenant não enxerga a atribuição.
    expect(await perfis.permissoesDoUsuario(TENANT_B, ANA)).toEqual([]);
  });

  it('lista só os usuários do tenant cujos perfis concedem a permissão (RLS)', async () => {
    const usuarios = new UsuariosComPermissaoPostgres();
    await executarNoTenant(TENANT_B, () =>
      banco.executar((tx) =>
        tx.usuarioPerfil.create({
          data: { tenantId: TENANT_B, usuarioId: BIA, perfil: 'admin_escritorio' },
        }),
      ),
    );
    const listar = (tenant: Uuid) =>
      executarNoTenant(tenant, () => banco.executar((tx) => usuarios.listar(tx, 'usuarios:gerir')));
    expect(await listar(TENANT_B)).toEqual([BIA]);
    // ANA (colaboradora) não administra a equipe; BIA é de outro tenant.
    expect(await listar(TENANT_A)).toEqual([]);
  });

  it.each(['admin_plataforma', 'curador'])(
    '%s não pode ser atribuído num escritório',
    async (perfil) => {
      await expect(
        executarNoTenant(TENANT_B, () =>
          banco.executar((tx) =>
            tx.usuarioPerfil.create({ data: { tenantId: TENANT_B, usuarioId: BIA, perfil } }),
          ),
        ),
      ).rejects.toThrow(perfil);
    },
  );
});

describe('impersonação com PostgreSQL e Redis (HU07)', () => {
  it('audita no tenant acessado e no plataforma e guarda a impersonação na sessão do Redis', async () => {
    const sessoes = new SessoesRedis(redis);
    const iniciar = new IniciarImpersonacao({
      sessoes,
      unidade: banco,
      tenants: new TenantsPostgres(),
      trilha: new TrilhaPostgres(),
      noTenant: noTenantDoBanco,
      relogio,
    });
    const admin = {
      id: gerarUuidV7(relogio),
      usuarioId: gerarUuidV7(relogio),
      tenantId: TENANT_P,
      nivel: 'completo' as const,
      segundoFatorAtivo: true,
      criadaEm: relogio.agora(),
      ultimoUso: relogio.agora(),
    };
    const token = randomBytes(32).toString('base64url');
    await sessoes.gravar(token, admin, relogio.agora().maisMs(3600_000));

    const inexistente = await iniciar.executar(
      token,
      admin,
      { tenantId: gerarUuidV7(relogio), motivo: 'Chamado 7: conferir' },
      CTX,
    );
    expect(inexistente.ok ? undefined : inexistente.erro.codigo).toBe('tenant-inexistente');

    const r = await iniciar.executar(
      token,
      admin,
      { tenantId: TENANT_A, motivo: 'Chamado 7: conferir' },
      CTX,
    );
    expect(r.ok).toBe(true);
    const gravada = await sessoes.obter(token);
    expect(gravada?.impersonacao).toMatchObject({
      tenantId: TENANT_A,
      motivo: 'Chamado 7: conferir',
    });
    // Impersonação vale 1 hora a partir de agora (HU07).
    expect(gravada?.impersonacao?.expiraEm.paraIso()).toBe(
      relogio.agora().maisMs(3_600_000).paraIso(),
    );

    const direto = await postgres.conectar('pz_sistema');
    try {
      const { rows } = await direto.query<{ tenant_id: string; usuario_id: string }>(
        `SELECT tenant_id, usuario_id FROM evento_auditoria
          WHERE tipo = 'identidade.impersonacao-iniciada' ORDER BY tenant_id`,
      );
      expect(rows.map((x) => x.tenant_id).sort()).toEqual([TENANT_A, TENANT_P].sort());
      expect(rows.every((x) => x.usuario_id === admin.usuarioId)).toBe(true);
    } finally {
      await direto.end();
    }
  });
});

describe('administração de tenants com PostgreSQL e Redis (HU39)', () => {
  it('a plataforma lista todos; o escritório só se vê; suspensão barra login e renovação', async () => {
    const sessoes = new SessoesRedis(redis);
    const deps = {
      unidade: banco,
      tenants: new TenantsPostgres(),
      trilha: new TrilhaPostgres(),
      noTenant: noTenantDoBanco,
      sessoes,
      relogio,
    };
    const listar = new ListarTenants(deps);
    const ids = async (tenant: Uuid) =>
      (await executarNoTenant(tenant, () => listar.executar({ limite: 10 }))).itens.map(
        (t) => t.id,
      );
    expect((await ids(TENANT_P)).sort()).toEqual([TENANT_A, TENANT_B, TENANT_P].sort());
    expect(await ids(TENANT_A)).toEqual([TENANT_A]);

    const dispositivos = new DispositivosPostgres(banco);
    const renovacoes = new RenovacoesRedis(redis);
    const tokens = new GeradorDeTokensSeguro();
    const publicador = new PublicadorOutbox(banco);
    const sessaoDaBia = {
      id: gerarUuidV7(),
      usuarioId: BIA,
      tenantId: TENANT_B,
      nivel: 'completo' as const,
      segundoFatorAtivo: true,
      criadaEm: relogio.agora(),
      ultimoUso: relogio.agora(),
    };
    const emitidos = await executarNoTenant(TENANT_B, () =>
      new RegistrarDispositivo(
        dispositivos,
        sessoes,
        renovacoes,
        tokens,
        publicador,
        relogio,
      ).executar(sessaoDaBia, { tipoCliente: 'mobile', nome: 'Celular' }),
    );

    const admin = { usuarioId: gerarUuidV7(), tenantId: TENANT_P, ...CTX };
    const motivo = 'Chamado 9: inadimplência confirmada';
    const suspenso = await new SuspenderTenant(deps).executar(admin, TENANT_B, motivo);
    expect(suspenso.ok && suspenso.valor.suspensao?.motivo).toBe(motivo);
    expect(await sessoes.obter(emitidos.tokenDeAcesso)).toBeUndefined();
    const credencial = await new CredenciaisPostgres(banco).localizarPorEmail(
      'bia@exemplo.invalid' as Email,
    );
    expect(credencial?.tenantSuspenso).toBe(true);
    const renovar = new RenovarTokens(
      dispositivos,
      sessoes,
      renovacoes,
      tokens,
      publicador,
      relogio,
      noTenantDoBanco,
    );
    expect((await renovar.executar(emitidos.tokenDeRenovacao)).ok).toBe(false);

    // QA (PZ-230): login real com a senha certa é recusado durante a suspensão e volta ao reativar.
    const hasher = new HasherArgon2();
    await executarNoTenant(TENANT_B, async () => {
      await new CredenciaisPostgres(banco).definirSenha(BIA, await hasher.gerar(SENHA_DA_BIA));
    });
    const autenticar = new Autenticar(
      new CredenciaisPostgres(banco),
      hasher,
      sessoes,
      tokens,
      relogio,
      protecao(),
    );
    const login = () =>
      autenticar.executar({ email: 'bia@exemplo.invalid', senha: SENHA_DA_BIA }, CTX);
    expect(await login()).toMatchObject({ ok: false, erro: { codigo: 'tenant-suspenso' } });
    expect((await new ReativarTenant(deps).executar(admin, TENANT_B)).ok).toBe(true);
    expect((await login()).ok).toBe(true);
    expect(
      (await new CredenciaisPostgres(banco).localizarPorEmail('bia@exemplo.invalid' as Email))
        ?.tenantSuspenso,
    ).toBe(false);

    const direto = await postgres.conectar('pz_sistema');
    try {
      const { rows } = await direto.query<{ tenant_id: string; tipo: string }>(
        `SELECT tenant_id, tipo FROM evento_auditoria
          WHERE tipo IN ('identidade.tenant-suspenso', 'identidade.tenant-reativado')`,
      );
      expect(rows).toHaveLength(4);
      expect(new Set(rows.map((x) => x.tenant_id))).toEqual(new Set([TENANT_B, TENANT_P]));
    } finally {
      await direto.end();
    }
  });
});

describe('recifra dos segredos do 2FA no PostgreSQL (PZ-359)', () => {
  it('troca a chave antiga pela ativa em cada tenant, sem perder o segredo; repetir não muda', async () => {
    const mestra = randomBytes(32).toString('base64');
    const [antiga, nova] = [randomBytes(32).toString('base64'), randomBytes(32).toString('base64')];
    const comAntiga = new CifraVersionada(new ProvedorChavesLocal(mestra, `l1:${antiga}`));
    // Rotação: a nova na frente; a antiga fica na lista para decifrar.
    const rotacao = new CifraVersionada(new ProvedorChavesLocal(mestra, `k1:${nova},l1:${antiga}`));
    const sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
    try {
      await sistema.executarComoSistema('teste: segredos com a chave antiga', async (tx) => {
        // Isola dos testes anteriores (2FA com outra cifra): só os dois desta prova.
        await tx.usuario.updateMany({ data: { totpSegredoCifrado: null } });
        await tx.usuario.update({
          where: { id: ANA },
          data: { totpSegredoCifrado: comAntiga.cifrar('SEGREDOFICTICIOANA') },
        });
        await tx.usuario.update({
          where: { id: BIA },
          data: { totpSegredoCifrado: comAntiga.cifrar('SEGREDOFICTICIOBIA') },
        });
      });
      const recifrar = () =>
        new RecifrarSegredosDoSegundoFator(
          sistema.unidade('teste: tenants com 2FA'),
          executarNoTenant,
          banco,
          new SegredosDoSegundoFatorPostgres(),
          rotacao,
        ).executar();
      expect(await recifrar()).toEqual({ escritorios: 2, recifrados: 2 });
      const gravados = await sistema.executarComoSistema('teste: conferir', (tx) =>
        tx.usuario.findMany({
          where: { id: { in: [ANA, BIA] } },
          orderBy: { id: 'asc' },
          select: { totpSegredoCifrado: true },
        }),
      );
      expect(gravados.map((g) => g.totpSegredoCifrado?.split('.')[1])).toEqual(['k1', 'k1']);
      expect(gravados.map((g) => rotacao.decifrar(g.totpSegredoCifrado ?? ''))).toEqual([
        'SEGREDOFICTICIOANA',
        'SEGREDOFICTICIOBIA',
      ]);
      expect(await recifrar()).toEqual({ escritorios: 2, recifrados: 0 });
    } finally {
      await sistema.executarComoSistema('teste: limpar segredos', (tx) =>
        tx.usuario.updateMany({
          where: { id: { in: [ANA, BIA] } },
          data: { totpSegredoCifrado: null },
        }),
      );
      await sistema.encerrar();
    }
  });
});
