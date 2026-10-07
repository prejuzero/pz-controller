import { randomBytes } from 'node:crypto';

import { AdvogadosEmMemoria } from '@pz/cadastro';
import { carregarAmbiente } from '@pz/config/env';
import {
  AcessosEmMemoria,
  CredenciaisEmMemoria,
  PerfisEmMemoria,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
  TentativasEmMemoria,
} from '@pz/identidade';
import { err, FixedClock, gerarUuidV7, Instant, ok, OutboxEmMemoria, Conflito } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Rotas do cadastro (HU11). Dados FICTÍCIOS: CPF gerado, OABs e e-mails inventados. */
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const tipos: string[] = [];
const emails = new Set<string>();
let api: NestFastifyApplication;
let token = '';

const pedido = {
  nome: 'Pessoa Fictícia',
  cpf: '529.982.247-25',
  email: 'pessoa@exemplo.com',
  senha: 'uma frase longa de teste',
  celular: '(11) 98765-4321',
  oabPrincipal: { numero: '123456', uf: 'SP' },
};

const pedir = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  api.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  });

beforeAll(async () => {
  const outbox = new OutboxEmMemoria();
  api = await criarApi({
    ambiente: carregarAmbiente(esquemaApi, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
      REDIS_URL: 'redis://127.0.0.1:6379',
      S3_REGION: 'us-east-1',
      CHAVE_CIFRAGEM: randomBytes(32).toString('base64'),
    }),
    relogio,
    verificadores: [],
    identidade: {
      credenciais: new CredenciaisEmMemoria(),
      sessoes,
      segundoFator: new SegundoFatorEmMemoria(),
      tentativas: new TentativasEmMemoria(),
      acessos: new AcessosEmMemoria(),
      perfis,
    },
    janelaDeRequisicoes: { registrar: () => Promise.resolve(1) },
    cadastro: (r) => ({
      noTenant: { executar: (_tenant, trabalho) => outbox.executar(trabalho) },
      unidade: outbox,
      contas: {
        preparar: (conta) => Promise.resolve(ok({ ...conta, senhaHash: 'hash' })),
        gravar: (tx, conta) => {
          if (emails.has(conta.email))
            return Promise.resolve(err(new Conflito('email-em-uso', 'E-mail já cadastrado.')));
          (tx as TransacaoEmMemoria).aoConfirmar(() => emails.add(conta.email));
          return Promise.resolve(ok(undefined));
        },
      },
      advogados: new AdvogadosEmMemoria(r),
      trilha: {
        registrar: (tx, entrada) => {
          (tx as TransacaoEmMemoria).aoConfirmar(() => tipos.push(entrada.tipo));
          return Promise.resolve();
        },
      },
      outbox,
    }),
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await api.close();
});

describe('cadastro pela API (HU11)', () => {
  it('cadastro público: 201 com o perfil; repetido, 409; inválido, 400', async () => {
    const criado = await api.inject({ method: 'POST', url: '/v1/cadastro', payload: pedido });
    expect(criado.statusCode).toBe(201);
    const { usuarioId, perfil } = criado.json<{ usuarioId: Uuid; perfil: { cpf: string } }>();
    expect(perfil.cpf).toBe('***.982.247-**');
    expect(tipos).toContain('cadastro.advogado-cadastrado');

    const repetido = await api.inject({ method: 'POST', url: '/v1/cadastro', payload: pedido });
    expect(repetido.statusCode).toBe(409);
    const invalido = await api.inject({
      method: 'POST',
      url: '/v1/cadastro',
      payload: { ...pedido, cpf: '123', email: 'b@exemplo.com' },
    });
    expect(invalido.statusCode).toBe(400);

    // Sessão do advogado recém-cadastrado (o login e o 2FA são da identidade).
    perfis.atribuir(usuarioId, 'advogado');
    token = randomBytes(32).toString('base64url');
    await sessoes.gravar(token, {
      id: gerarUuidV7(),
      usuarioId,
      tenantId: gerarUuidV7(),
      nivel: 'completo',
      segundoFatorAtivo: true,
      criadaEm: relogio.agora(),
      ultimoUso: relogio.agora(),
    });
  });

  it('perfil e OABs da sessão', async () => {
    expect((await pedir('GET', '/v1/perfil')).statusCode).toBe(200);
    const alterado = await pedir('PATCH', '/v1/perfil', { celular: '21998765432' });
    expect(alterado.json<{ celular: string }>().celular).toBe('21998765432');
    const oab = await pedir('POST', '/v1/oabs', { numero: '555', uf: 'MG' });
    expect(oab.statusCode).toBe(201);
    const { id } = oab.json<{ id: string }>();
    expect((await pedir('DELETE', `/v1/oabs/${id}`)).statusCode).toBe(204);
    expect((await pedir('DELETE', `/v1/oabs/${id}`)).statusCode).toBe(404);
    expect((await pedir('DELETE', '/v1/oabs/nao-e-uuid')).statusCode).toBe(400);
  });

  it('sem sessão, perfil e OABs exigem autenticação', async () => {
    const semSessao = await api.inject({ method: 'GET', url: '/v1/perfil' });
    expect(semSessao.statusCode).toBe(401);
  });
});
