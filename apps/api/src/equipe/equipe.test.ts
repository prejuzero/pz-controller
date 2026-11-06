import { randomBytes } from 'node:crypto';

import { carregarAmbiente } from '@pz/config/env';
import {
  AcessosEmMemoria,
  CredenciaisEmMemoria,
  EquipeEmMemoria,
  PerfisEmMemoria,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
  TentativasEmMemoria,
} from '@pz/identidade';
import { CifraVersionada, ProvedorChavesLocal } from '@pz/integracoes';
import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ConviteDeMembro, EquipeDoEscritorio } from '@pz/contracts';
import type { CodigoPerfil, Email } from '@pz/identidade';

/** Equipe do escritório na API (HU41). Dados FICTÍCIOS. */
const relogio = new FixedClock(Instant.deIso('2026-11-06T12:00:00Z'));
const CHAVE = randomBytes(32).toString('base64');
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const credenciais = new CredenciaisEmMemoria();
const equipe = new EquipeEmMemoria(credenciais);
const unidade = new OutboxEmMemoria();
const ESCRITORIO = gerarUuidV7();
const tokens = new Map<string, string>();
let api: NestFastifyApplication;

async function entrarComo(nome: string, perfil: CodigoPerfil) {
  const usuarioId = gerarUuidV7();
  perfis.atribuir(usuarioId, perfil);
  equipe.incluir({
    usuarioId,
    nome,
    email: `${nome}@exemplo.invalid`,
    perfis: [perfil],
    criadoEm: relogio.agora(),
    desativadoEm: null,
  });
  const token = randomBytes(32).toString('base64url');
  await sessoes.gravar(token, {
    id: gerarUuidV7(),
    usuarioId,
    tenantId: ESCRITORIO,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: relogio.agora(),
    ultimoUso: relogio.agora(),
  });
  tokens.set(nome, token);
  return usuarioId;
}

const pedir = (
  quem: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) =>
  api.inject({
    method,
    url,
    headers: { authorization: `Bearer ${tokens.get(quem) ?? ''}` },
    ...(payload === undefined ? {} : { payload }),
  });

let titular = '';
let colaboradora = '';

beforeAll(async () => {
  api = await criarApi({
    termos: termosEmMemoria().dependencias,
    ambiente: carregarAmbiente(esquemaApi, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
      REDIS_URL: 'redis://127.0.0.1:6379',
      S3_REGION: 'us-east-1',
      CHAVE_CIFRAGEM: CHAVE,
    }),
    relogio,
    verificadores: [],
    identidade: {
      credenciais,
      sessoes,
      segundoFator: new SegundoFatorEmMemoria(),
      tentativas: new TentativasEmMemoria(),
      acessos: new AcessosEmMemoria(),
      perfis,
      equipe: { unidade, equipe, trilha: { registrar: () => Promise.resolve() }, outbox: unidade },
    },
    janelaDeRequisicoes: { registrar: () => Promise.resolve(1) },
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
  titular = await entrarComo('titular', 'admin_escritorio');
  colaboradora = await entrarComo('colab', 'colaborador');
});

afterAll(async () => {
  await api.close();
});

describe('equipe do escritório (HU41)', () => {
  it('convida, descreve e aceita pelo link; lista a equipe', async () => {
    const criado = await pedir('titular', 'POST', '/v1/equipe/convites', {
      email: 'novo.advogado@exemplo.invalid',
      nome: 'Novo Advogado',
      perfil: 'advogado',
    });
    expect(criado.statusCode).toBe(201);
    expect(criado.json<ConviteDeMembro>().perfil).toBe('advogado');
    const evento = unidade.pendentes().find((e) => e.tipo === 'ConviteDeMembroEnviado');
    const cifra = new CifraVersionada(new ProvedorChavesLocal(CHAVE), CHAVE);
    const token = cifra.decifrar((evento?.payload as { tokenCifrado: string }).tokenCifrado);

    const descrito = await api.inject({
      method: 'POST',
      url: '/v1/equipe/convites/descrever',
      payload: { token },
    });
    expect(descrito.json()).toEqual({
      nome: 'Novo Advogado',
      email: 'novo.advogado@exemplo.invalid',
      perfil: 'advogado',
    });
    const aceito = await api.inject({
      method: 'POST',
      url: '/v1/equipe/convites/aceitar',
      payload: { token, senha: 'senha ficticia do advogado' },
    });
    expect(aceito.statusCode).toBe(204);
    expect(
      await credenciais.localizarPorEmail('novo.advogado@exemplo.invalid' as Email),
    ).toBeDefined();
    const invalido = await api.inject({
      method: 'POST',
      url: '/v1/equipe/convites/descrever',
      payload: { token: 'x'.repeat(30) },
    });
    expect(invalido.statusCode).toBe(401);

    const lista = (await pedir('titular', 'GET', '/v1/equipe')).json<EquipeDoEscritorio>();
    expect(lista.membros.map((m) => m.email)).toContain('novo.advogado@exemplo.invalid');
    expect((await pedir('colab', 'GET', '/v1/equipe')).statusCode).toBe(403);
  });

  it('cancela convite, troca perfis, desativa e protege o último administrador', async () => {
    const criado = (
      await pedir('titular', 'POST', '/v1/equipe/convites', {
        email: 'cancelar@exemplo.invalid',
        nome: 'Cancelar',
        perfil: 'colaborador',
      })
    ).json<ConviteDeMembro>();
    expect((await pedir('titular', 'DELETE', `/v1/equipe/convites/${criado.id}`)).statusCode).toBe(
      204,
    );
    expect((await pedir('titular', 'DELETE', `/v1/equipe/convites/${criado.id}`)).statusCode).toBe(
      404,
    );
    expect(
      (
        await pedir('titular', 'PUT', `/v1/equipe/membros/${colaboradora}/perfis`, {
          perfis: ['advogado'],
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await pedir('titular', 'PUT', `/v1/equipe/membros/${titular}/perfis`, {
          perfis: ['advogado'],
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await pedir('titular', 'POST', `/v1/equipe/membros/${titular}/desativar`)).statusCode,
    ).toBe(409);
    expect(
      (await pedir('titular', 'POST', `/v1/equipe/membros/${colaboradora}/desativar`)).statusCode,
    ).toBe(204);
    expect((await pedir('colab', 'GET', '/v1/auth/eu')).statusCode).toBe(401);
  });
});
