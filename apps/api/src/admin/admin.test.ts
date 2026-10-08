import { randomBytes } from 'node:crypto';

import { Controller, Get } from '@nestjs/common';
import { FilaDeMortosEmMemoria, PainelEmMemoria, UsoDeIaEmMemoria } from '@pz/administracao';
import { RevisaoManualEmMemoria } from '@pz/classificacao';
import { carregarAmbiente } from '@pz/config/env';
import { tenantAtual } from '@pz/db';
import {
  AcessosEmMemoria,
  CredenciaisEmMemoria,
  DURACAO_DA_IMPERSONACAO_MS,
  PerfisEmMemoria,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
  TenantsEmMemoria,
  TentativasEmMemoria,
} from '@pz/identidade';
import { FixedClock, gerarUuidV7, Instant, LocalDate, OutboxEmMemoria } from '@pz/kernel';
import { SupressoesEmMemoria } from '@pz/notificacoes';
import { obterContexto } from '@pz/observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { RequerPermissao } from '../http/acesso.js';
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria } from '@pz/kernel';

/**
 * Impersonação pela API (HU07, PZ-105): tenant efetivo, só leitura, validade e auditoria. Painel
 * de filas e reprocessamento auditado da DLQ (PZ-107).
 */

@Controller('v1/teste-impersonacao')
class LeituraDeTeste {
  @Get()
  @RequerPermissao('prazos:ler')
  ler() {
    const { userId, impersonacaoId } = obterContexto();
    return { tenant: tenantAtual(), userId, impersonacaoId };
  }
}

const PLATAFORMA = gerarUuidV7();
const ESCRITORIO = gerarUuidV7();
const ADMIN = gerarUuidV7();
const relogio = new FixedClock(Instant.deIso('2026-10-06T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const tenants = new TenantsEmMemoria();
const registros: { tenant: string | undefined; entrada: EntradaDeAuditoria }[] = [];
const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
  registrar(tx, entrada) {
    const tenant = tenantAtual();
    tx.aoConfirmar(() => registros.push({ tenant, entrada }));
    return Promise.resolve();
  },
};
const token = randomBytes(32).toString('base64url');
const autorizacao = { authorization: `Bearer ${token}` };
const SEM_PERFIL = gerarUuidV7();
const tokenSemPerfil = randomBytes(32).toString('base64url');
const ADVOGADO = gerarUuidV7();
const tokenAdvogado = randomBytes(32).toString('base64url');
const mortos = new FilaDeMortosEmMemoria();
const painel = new PainelEmMemoria();
const supressoes = new SupressoesEmMemoria();
const usoDeIa = new UsoDeIaEmMemoria();
const revisaoManual = new RevisaoManualEmMemoria();
const CURADOR = gerarUuidV7();
const tokenCurador = randomBytes(32).toString('base64url');
let api: NestFastifyApplication;

beforeAll(async () => {
  tenants.cadastrar(PLATAFORMA, 'plataforma');
  tenants.cadastrar(ESCRITORIO, 'escritorio');
  perfis.atribuir(ADMIN, 'admin_plataforma');
  perfis.atribuir(ADVOGADO, 'advogado');
  perfis.atribuir(CURADOR, 'curador');
  api = await criarApi({
    termos: termosEmMemoria().dependencias,
    ambiente: carregarAmbiente(esquemaApi, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
      REDIS_URL: 'redis://127.0.0.1:6379',
      S3_REGION: 'us-east-1',
      CHAVE_CIFRAGEM: randomBytes(32).toString('base64'),
    }),
    relogio,
    verificadores: [],
    controllersExtras: [LeituraDeTeste],
    identidade: {
      credenciais: new CredenciaisEmMemoria(),
      sessoes,
      segundoFator: new SegundoFatorEmMemoria(),
      tentativas: new TentativasEmMemoria(),
      acessos: new AcessosEmMemoria(),
      perfis,
      impersonacao: { unidade: new OutboxEmMemoria(), tenants, trilha },
      tenantsAdministrados: tenants,
    },
    janelaDeRequisicoes: { registrar: () => Promise.resolve(1) },
    filas: {
      reprocessamento: { filaDeMortos: mortos, unidade: new OutboxEmMemoria(), trilha },
      painel: [],
      integracoes: painel,
      contador: painel,
    },
    supressoes: { unidade: new OutboxEmMemoria(), consulta: supressoes },
    revisaoManual: { unidade: new OutboxEmMemoria(), consulta: revisaoManual },
    usoDeIa: { unidade: new OutboxEmMemoria(), consulta: usoDeIa },
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
});

beforeEach(async () => {
  registros.length = 0;
  const agora = relogio.agora();
  await sessoes.gravar(token, {
    id: gerarUuidV7(),
    usuarioId: ADMIN,
    tenantId: PLATAFORMA,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: agora,
    ultimoUso: agora,
  });
  await sessoes.gravar(tokenAdvogado, {
    id: gerarUuidV7(),
    usuarioId: ADVOGADO,
    tenantId: ESCRITORIO,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: agora,
    ultimoUso: agora,
  });
  await sessoes.gravar(tokenCurador, {
    id: gerarUuidV7(),
    usuarioId: CURADOR,
    tenantId: PLATAFORMA,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: agora,
    ultimoUso: agora,
  });
  await sessoes.gravar(tokenSemPerfil, {
    id: gerarUuidV7(),
    usuarioId: SEM_PERFIL,
    tenantId: PLATAFORMA,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: agora,
    ultimoUso: agora,
  });
});

afterAll(async () => {
  await api.close();
});

const iniciar = (
  payload: Record<string, string> = { tenantId: ESCRITORIO, motivo: 'Chamado 42: conferir' },
) => api.inject({ method: 'POST', url: '/v1/admin/impersonacao', headers: autorizacao, payload });
const ler = () =>
  api.inject({ method: 'GET', url: '/v1/teste-impersonacao', headers: autorizacao });

describe('impersonação pela API (HU07)', () => {
  it('sem impersonação, o admin não lê dados de tenant', async () => {
    expect((await ler()).statusCode).toBe(403);
  });

  it('inicia: 201, faixa em /v1/auth/eu, requisições no tenant acessado e só leitura', async () => {
    const resposta = await iniciar();
    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json<{ permissoes: string[]; impersonacao: { tenantId: string } }>();
    expect(corpo.impersonacao.tenantId).toBe(ESCRITORIO);
    expect(corpo.permissoes).not.toContain('conta:gerir');
    expect(corpo.permissoes).toContain('prazos:ler');

    const eu = await api.inject({ method: 'GET', url: '/v1/auth/eu', headers: autorizacao });
    expect(eu.json<{ tenantId: string; impersonacao: unknown }>()).toMatchObject({
      tenantId: PLATAFORMA,
      impersonacao: { tenantId: ESCRITORIO, motivo: 'Chamado 42: conferir' },
    });
    const leitura = (await ler()).json<Record<string, string>>();
    expect(leitura).toMatchObject({ tenant: ESCRITORIO, userId: ADMIN });
    expect(leitura.impersonacaoId).toEqual(expect.any(String));
    const escrita = await api.inject({
      method: 'GET',
      url: '/v1/auth/acessos',
      headers: autorizacao,
    });
    expect(escrita.statusCode).toBe(403);
    expect(registros.map((r) => r.tenant)).toEqual([ESCRITORIO, PLATAFORMA]);
  });

  it('segunda impersonação em curso: 409; motivo curto: 400; tenant desconhecido: 404', async () => {
    expect((await iniciar({ tenantId: ESCRITORIO, motivo: 'curto' })).statusCode).toBe(400);
    expect(
      (await iniciar({ tenantId: gerarUuidV7(), motivo: 'Chamado 42: conferir' })).statusCode,
    ).toBe(404);
    expect((await iniciar()).statusCode).toBe(201);
    expect((await iniciar()).statusCode).toBe(409);
  });

  it('encerra pelo DELETE e vence sozinha em 60 minutos', async () => {
    await iniciar();
    const fim = await api.inject({
      method: 'DELETE',
      url: '/v1/admin/impersonacao',
      headers: autorizacao,
    });
    expect(fim.statusCode).toBe(204);
    expect((await ler()).statusCode).toBe(403);
    expect(registros.at(-1)?.entrada.tipo).toBe('identidade.impersonacao-encerrada');

    await iniciar();
    expect((await ler()).statusCode).toBe(200);
    relogio.avancarMs(DURACAO_DA_IMPERSONACAO_MS);
    expect((await ler()).statusCode).toBe(403);
    const eu = await api.inject({ method: 'GET', url: '/v1/auth/eu', headers: autorizacao });
    expect(eu.json<{ impersonacao: unknown }>().impersonacao).toBeNull();
  });
});

const MORTO = {
  fila: 'notificacoes',
  jobId: 'notificacao.email-1',
  tipo: 'notificacao.email',
  erro: 'SMTP fora do ar',
  tentativas: 6,
  falhouEm: '2026-10-06T11:00:00.000Z',
  originalDisponivel: true,
};
const reprocessar = (headers = autorizacao, motivo = 'SMTP voltou (chamado 77)') =>
  api.inject({
    method: 'POST',
    url: '/v1/admin/filas/notificacoes/dlq/notificacao.email-1/reprocessar',
    headers,
    payload: { motivo },
  });

describe('reprocessamento da DLQ pela API (HU07)', () => {
  it('admin da plataforma: 204, job de volta à fila e auditoria no tenant plataforma', async () => {
    mortos.morrer(MORTO);
    expect((await reprocessar()).statusCode).toBe(204);
    expect(mortos.reprocessados.at(-1)).toEqual(MORTO);
    expect(registros).toMatchObject([
      {
        tenant: PLATAFORMA,
        entrada: {
          tipo: 'administracao.job-morto-reprocessado',
          entidadeId: 'notificacoes/notificacao.email-1',
        },
      },
    ]);
  });

  it('fora da DLQ: 404; original apagado: 409; motivo curto: 400', async () => {
    expect((await reprocessar()).statusCode).toBe(404);
    mortos.morrer({ ...MORTO, originalDisponivel: false });
    expect((await reprocessar()).statusCode).toBe(409);
    expect((await reprocessar(autorizacao, 'curto')).statusCode).toBe(400);
    expect(registros).toEqual([]);
  });

  it('sem admin:filas, nem impersonando: 403', async () => {
    mortos.morrer(MORTO);
    const semPerfil = { authorization: `Bearer ${tokenSemPerfil}` };
    expect((await reprocessar(semPerfil)).statusCode).toBe(403);
    await iniciar();
    registros.length = 0;
    expect((await reprocessar()).statusCode).toBe(403);
    expect(registros).toEqual([]);
  });
});

describe('painel de filas em /admin/filas (HU07)', () => {
  const painel = (cookie?: string) =>
    api.inject({
      method: 'GET',
      url: '/admin/filas',
      headers: cookie === undefined ? {} : { cookie: `__Host-pz_sessao=${cookie}` },
    });

  it('admin da plataforma pelo navegador: abre o painel', async () => {
    const resposta = await painel(token);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toContain('text/html');
  });

  it('sem sessão: 401; sem admin:filas ou impersonando: 403; ações do painel: 405', async () => {
    expect((await painel()).statusCode).toBe(401);
    expect((await painel('x'.repeat(43))).statusCode).toBe(401);
    expect((await painel(tokenSemPerfil)).statusCode).toBe(403);
    const acao = await api.inject({
      method: 'PUT',
      url: '/admin/filas/api/queues/notificacoes-dlq/retry/failed',
      headers: { cookie: `__Host-pz_sessao=${token}` },
    });
    expect(acao.statusCode).toBe(405);
    await iniciar();
    expect((await painel(token)).statusCode).toBe(403);
  });

  it('a API do painel também passa pela guarda', async () => {
    const resposta = await api.inject({ method: 'GET', url: '/admin/filas/api/queues' });
    expect(resposta.statusCode).toBe(401);
  });
});

describe('tenants da plataforma pela API (HU39)', () => {
  const pedir = (method: 'GET' | 'PATCH' | 'POST' | 'DELETE', url: string, payload?: object) =>
    api.inject({
      method,
      url,
      headers: autorizacao,
      ...(payload === undefined ? {} : { payload }),
    });

  it('lista com cursor e detalha; a plataforma não aparece no detalhe', async () => {
    const pagina = await pedir('GET', '/v1/admin/tenants?limite=1');
    expect(pagina.statusCode).toBe(200);
    const corpo = pagina.json<{ itens: { id: string }[]; proximoCursor: string | null }>();
    expect(corpo.itens).toHaveLength(1);
    expect(corpo.proximoCursor).toBe(corpo.itens[0]?.id);
    const seguinte = await pedir(
      'GET',
      `/v1/admin/tenants?limite=1&cursor=${String(corpo.proximoCursor)}`,
    );
    expect(seguinte.statusCode).toBe(200);
    expect(seguinte.json<{ itens: { id: string }[] }>().itens[0]?.id).not.toBe(corpo.itens[0]?.id);
    expect((await pedir('GET', `/v1/admin/tenants?cursor=nao-e-uuid`)).statusCode).toBe(400);
    const detalhe = await pedir('GET', `/v1/admin/tenants/${ESCRITORIO}`);
    expect(detalhe.json()).toMatchObject({ id: ESCRITORIO, suspensao: null, encerradoEm: null });
    expect((await pedir('GET', `/v1/admin/tenants/${PLATAFORMA}`)).statusCode).toBe(404);
  });

  it('assinatura, suspensão e reativação com auditoria; motivo curto: 400', async () => {
    const assinatura = await pedir('PATCH', `/v1/admin/tenants/${ESCRITORIO}/assinatura`, {
      plano: 'Escritório 10',
      situacaoAssinatura: 'ativa',
    });
    expect(assinatura.json()).toMatchObject({
      plano: 'Escritório 10',
      situacaoAssinatura: 'ativa',
    });
    expect(
      (await pedir('PATCH', `/v1/admin/tenants/${ESCRITORIO}/assinatura`, {})).statusCode,
    ).toBe(400);
    expect(
      (await pedir('POST', `/v1/admin/tenants/${ESCRITORIO}/suspensao`, { motivo: 'curto' }))
        .statusCode,
    ).toBe(400);
    const suspenso = await pedir('POST', `/v1/admin/tenants/${ESCRITORIO}/suspensao`, {
      motivo: 'Chamado 88: inadimplência confirmada',
    });
    expect(suspenso.statusCode).toBe(200);
    expect(suspenso.json()).toMatchObject({
      suspensao: { motivo: 'Chamado 88: inadimplência confirmada' },
    });
    const reativado = await pedir('DELETE', `/v1/admin/tenants/${ESCRITORIO}/suspensao`);
    expect(reativado.json()).toMatchObject({ suspensao: null });
    expect(registros.map((r) => [r.tenant, r.entrada.tipo])).toEqual([
      [ESCRITORIO, 'identidade.assinatura-alterada'],
      [PLATAFORMA, 'identidade.assinatura-alterada'],
      [ESCRITORIO, 'identidade.tenant-suspenso'],
      [PLATAFORMA, 'identidade.tenant-suspenso'],
      [ESCRITORIO, 'identidade.tenant-reativado'],
      [PLATAFORMA, 'identidade.tenant-reativado'],
    ]);
  });

  it('assinatura parcial: altera só o campo enviado', async () => {
    await pedir('PATCH', `/v1/admin/tenants/${ESCRITORIO}/assinatura`, {
      plano: 'Escritório 10',
      situacaoAssinatura: 'ativa',
    });
    expect(
      (
        await pedir('PATCH', `/v1/admin/tenants/${ESCRITORIO}/assinatura`, { plano: 'Solo' })
      ).json(),
    ).toMatchObject({ plano: 'Solo', situacaoAssinatura: 'ativa' });
    expect(
      (
        await pedir('PATCH', `/v1/admin/tenants/${ESCRITORIO}/assinatura`, {
          situacaoAssinatura: 'inadimplente',
        })
      ).json(),
    ).toMatchObject({ plano: 'Solo', situacaoAssinatura: 'inadimplente' });
  });

  it('sem admin:tenants: 403', async () => {
    const resposta = await api.inject({
      method: 'GET',
      url: '/v1/admin/tenants',
      headers: { authorization: `Bearer ${tokenSemPerfil}` },
    });
    expect(resposta.statusCode).toBe(403);
  });
});

describe('painel do administrador pela API (HU39)', () => {
  const ler = (url: string, headers = autorizacao) => api.inject({ method: 'GET', url, headers });

  it('integrações, filas e rejeições de e-mail', async () => {
    const agora = relogio.agora();
    await painel.gravar(
      {
        instancia: 'w1',
        em: agora,
        situacoes: [
          { adaptador: 'djen', estado: 'degradado', ultimaFalha: agora, erro: 'HTTP 503' },
        ],
      },
      [{ adaptador: 'djen', instancia: 'w1', em: agora, erro: 'HTTP 503' }],
    );
    painel.filas = [
      { fila: 'captura', aguardando: 3, ativos: 1, atrasados: 0, falhos: 2, mortos: 1 },
    ];
    supressoes.itens.push({ email: 'rejeitou@exemplo.invalid', motivo: 'bounce', criadaEm: agora });

    expect((await ler('/v1/admin/integracoes')).json()).toEqual({
      adaptadores: [
        {
          adaptador: 'djen',
          estado: 'degradado',
          instancias: 1,
          ultimoSucesso: null,
          ultimaFalha: agora.paraIso(),
          erro: 'HTTP 503',
        },
      ],
      falhas: [{ adaptador: 'djen', instancia: 'w1', em: agora.paraIso(), erro: 'HTTP 503' }],
    });
    expect((await ler('/v1/admin/filas')).json()).toEqual({ filas: painel.filas });
    expect((await ler('/v1/admin/rejeicoes-email?limite=10')).json()).toEqual({
      itens: [{ email: 'rejeitou@exemplo.invalid', motivo: 'bounce', criadaEm: agora.paraIso() }],
      proximoCursor: null,
    });
    expect(
      (await ler('/v1/admin/rejeicoes-email?limite=10&cursor=rejeitou@exemplo.invalid')).json(),
    ).toEqual({ itens: [], proximoCursor: null });

    await painel.gravar(
      {
        instancia: 'w1',
        em: agora,
        situacoes: [{ adaptador: 'djen', estado: 'operacional', ultimoSucesso: agora }],
      },
      [],
    );
    expect((await ler('/v1/admin/integracoes')).json()).toMatchObject({
      adaptadores: [
        {
          adaptador: 'djen',
          estado: 'operacional',
          ultimoSucesso: agora.paraIso(),
          ultimaFalha: null,
          erro: null,
        },
      ],
    });
  });

  it('custo de IA por dia, tarefa e modelo, com o custo médio por publicação e a meta (HU21)', async () => {
    usoDeIa.linhas.push({
      dia: LocalDate.de(2026, 10, 6),
      tarefa: 'classificar-ato',
      modelo: 'claude-haiku-4-5',
      chamadas: 2,
      tokensEntrada: 2000,
      tokensSaida: 200,
      tokensCacheLidos: 1000,
      custoUsd: 0.0032,
    });
    expect((await ler('/v1/admin/uso-ia?dias=7')).json()).toEqual({
      de: '2026-09-30',
      ate: '2026-10-06',
      custoTotalUsd: 0.0032,
      classificacao: { chamadas: 2, custoMedioUsd: 0.0016, metaUsd: 0.0045 },
      dias: [
        {
          dia: '2026-10-06',
          tarefa: 'classificar-ato',
          modelo: 'claude-haiku-4-5',
          chamadas: 2,
          tokensEntrada: 2000,
          tokensSaida: 200,
          tokensCacheLidos: 1000,
          custoUsd: 0.0032,
        },
      ],
    });
    expect((await ler('/v1/admin/uso-ia?dias=91')).statusCode).toBe(400);
  });

  it('fila de revisão manual: o curador lista; o administrador sem curadoria leva 403 (HU21)', async () => {
    const agora = relogio.agora();
    const conteudoId = gerarUuidV7();
    revisaoManual.itens.push({
      conteudoId,
      origem: 'nenhuma',
      motivo: 'saida-invalida',
      tipoAto: null,
      confianca: null,
      evidencias: [],
      versaoPrompt: null,
      modelo: null,
      criadaEm: agora,
    });
    const curador = { authorization: `Bearer ${tokenCurador}` };
    const url = '/v1/admin/classificacoes/revisao-manual?limite=10';
    expect((await ler(url, curador)).json()).toEqual({
      itens: [
        {
          conteudoId,
          origem: 'nenhuma',
          motivo: 'saida-invalida',
          tipoAto: null,
          confianca: null,
          evidencias: [],
          versaoPrompt: null,
          modelo: null,
          criadaEm: agora.paraIso(),
        },
      ],
      proximoCursor: null,
    });
    expect((await ler(`${url}&cursor=x`, curador)).statusCode).toBe(400);
    expect((await ler(`${url}&cursor=${conteudoId}`, curador)).json()).toEqual({
      itens: [],
      proximoCursor: null,
    });
    expect((await ler(url)).statusCode).toBe(403);
  });

  it('sem permissão de administrador: 403', async () => {
    const semPerfil = { authorization: `Bearer ${tokenSemPerfil}` };
    for (const url of [
      '/v1/admin/integracoes',
      '/v1/admin/filas',
      '/v1/admin/rejeicoes-email',
      '/v1/admin/uso-ia',
    ]) {
      expect((await ler(url, semPerfil)).statusCode).toBe(403);
    }
  });
});

describe('QA do painel administrativo (PZ-230)', () => {
  it('advogado do escritório recebe 403 em toda rota de administração', async () => {
    const rotas: [method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object][] = [
      ['GET', '/v1/admin/tenants'],
      ['GET', `/v1/admin/tenants/${ESCRITORIO}`],
      ['PATCH', `/v1/admin/tenants/${ESCRITORIO}/assinatura`, { situacaoAssinatura: 'ativa' }],
      ['POST', `/v1/admin/tenants/${ESCRITORIO}/suspensao`, { motivo: 'Chamado 1: tentativa' }],
      ['DELETE', `/v1/admin/tenants/${ESCRITORIO}/suspensao`],
      ['GET', '/v1/admin/integracoes'],
      ['GET', '/v1/admin/filas'],
      ['GET', '/v1/admin/rejeicoes-email'],
      ['GET', '/v1/admin/uso-ia'],
      ['GET', '/v1/admin/classificacoes/revisao-manual'],
      ['POST', '/v1/admin/impersonacao', { tenantId: PLATAFORMA, motivo: 'Chamado 1: tentativa' }],
      [
        'POST',
        '/v1/admin/filas/notificacoes/dlq/x/reprocessar',
        { motivo: 'Chamado 1: tentativa' },
      ],
    ];
    for (const [method, url, payload] of rotas) {
      const resposta = await api.inject({
        method,
        url,
        headers: { authorization: `Bearer ${tokenAdvogado}` },
        ...(payload === undefined ? {} : { payload }),
      });
      expect([url, resposta.statusCode]).toEqual([url, 403]);
    }
    expect(registros).toEqual([]);
  });
});
