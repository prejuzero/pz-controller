import { randomBytes } from 'node:crypto';

import { AdvogadosEmMemoria, ClientesEmMemoria, ProcessosEmMemoria } from '@pz/cadastro';
import { carregarAmbiente } from '@pz/config/env';
import {
  AcessosEmMemoria,
  CredenciaisEmMemoria,
  PerfisEmMemoria,
  RedefinicoesEmMemoria,
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

const pedir = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) =>
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
      verificacoesDeEmail: new RedefinicoesEmMemoria(),
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
      verificacao: {
        preparar: (conta) =>
          Promise.resolve({
            id: gerarUuidV7(),
            tipo: 'VerificacaoDeEmailSolicitada',
            versao: 1,
            tenantId: conta.tenantId,
            agregadoId: conta.usuarioId,
            ocorridoEm: r.agora(),
            payload: {},
          }),
      },
      advogados: new AdvogadosEmMemoria(r),
      ...(() => {
        const processos = new ProcessosEmMemoria(r);
        return { processos, clientes: new ClientesEmMemoria(processos) };
      })(),
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

  it('verificação do e-mail: token desconhecido é 401; sem token, 400', async () => {
    const r = await api.inject({
      method: 'POST',
      url: '/v1/email/verificar',
      payload: { token: 'x' },
    });
    expect(r.statusCode).toBe(401);
    const vazio = await api.inject({ method: 'POST', url: '/v1/email/verificar', payload: {} });
    expect(vazio.statusCode).toBe(400);
  });

  it('sem sessão, perfil e OABs exigem autenticação', async () => {
    const semSessao = await api.inject({ method: 'GET', url: '/v1/perfil' });
    expect(semSessao.statusCode).toBe(401);
  });
});

describe('processos e clientes pela API (HU12)', () => {
  // Número FICTÍCIO com dígito verificador conferido (mesmo do teste do kernel).
  const numero = '0000001-68.2026.8.26.0100';

  it('cliente, processo, sigilo e cobertura com auditoria', async () => {
    const cliente = await pedir('POST', '/v1/clientes', {
      nome: 'Cliente Fictício',
      documento: '111.444.777-35',
    });
    expect(cliente.statusCode).toBe(201);
    const { id: clienteId } = cliente.json<{ id: string }>();

    const criado = await pedir('POST', '/v1/processos', {
      numeroCnj: numero.replace(/\D/g, ''),
      clienteId,
    });
    expect(criado.statusCode).toBe(201);
    const processo = criado.json<{ id: string; numeroCnj: string; tribunal: string }>();
    expect(processo).toMatchObject({ numeroCnj: numero, tribunal: 'TJSP' });
    expect((await pedir('POST', '/v1/processos', { numeroCnj: numero })).statusCode).toBe(409);
    expect((await pedir('POST', '/v1/processos', { numeroCnj: '123' })).statusCode).toBe(400);

    const sigilo = await pedir('PATCH', `/v1/processos/${processo.id}`, { sigiloso: true });
    expect(sigilo.json<{ sigiloso: boolean }>().sigiloso).toBe(true);
    const semMotivo = await pedir('PUT', `/v1/processos/${processo.id}/cobertura`, {
      cobertura: 'manual',
    });
    expect(semMotivo.statusCode).toBe(422);
    const manual = await pedir('PUT', `/v1/processos/${processo.id}/cobertura`, {
      cobertura: 'manual',
      motivo: 'Intimações só no painel do tribunal.',
    });
    expect(manual.json<{ cobertura: string }>().cobertura).toBe('manual');
    expect(tipos).toEqual(
      expect.arrayContaining([
        'cadastro.cliente-cadastrado',
        'cadastro.processo-cadastrado',
        'cadastro.sigilo-alterado',
        'cadastro.cobertura-alterada',
      ]),
    );

    const lista = await pedir('GET', '/v1/processos?numero=0000001&sigiloso=true&limite=1');
    expect(lista.json<{ itens: unknown[]; proximoCursor: null }>()).toMatchObject({
      itens: [{ id: processo.id }],
      proximoCursor: null,
    });
    expect((await pedir('GET', `/v1/processos/${processo.id}`)).statusCode).toBe(200);
    expect((await pedir('GET', '/v1/processos?cursor=x')).statusCode).toBe(400);
    expect(
      (await pedir('GET', '/v1/clientes?nome=fict')).json<{ itens: unknown[] }>().itens,
    ).toHaveLength(1);
    expect((await pedir('GET', `/v1/clientes/${clienteId}`)).statusCode).toBe(200);
    expect(
      (await pedir('PATCH', `/v1/clientes/${clienteId}`, { nome: 'Outro Nome' })).statusCode,
    ).toBe(200);
    expect((await pedir('DELETE', `/v1/clientes/${clienteId}`)).statusCode).toBe(422);
    await pedir('PATCH', `/v1/processos/${processo.id}`, { clienteId: null });
    expect((await pedir('DELETE', `/v1/clientes/${clienteId}`)).statusCode).toBe(204);
  });

  it('sem sessão, processos exigem autenticação', async () => {
    expect((await api.inject({ method: 'GET', url: '/v1/processos' })).statusCode).toBe(401);
  });
});
