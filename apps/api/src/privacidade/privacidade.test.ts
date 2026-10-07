import { randomBytes } from 'node:crypto';

import { carregarAmbiente } from '@pz/config/env';
import {
  AcessosEmMemoria,
  CredenciaisEmMemoria,
  PerfisEmMemoria,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
  TentativasEmMemoria,
} from '@pz/identidade';
import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { TabelaEmMemoria } from '@pz/prazos';
import { ExportacoesEmMemoria } from '@pz/privacidade';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import { EncerramentosEmTeste } from './encerramentos-de-teste.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CodigoPerfil } from '@pz/identidade';
import type { ArmazenamentoArquivos } from '@pz/integracoes';

/** Exportação de dados (HU38). Dados FICTÍCIOS. */
const PLATAFORMA = gerarUuidV7();
const ESCRITORIO = gerarUuidV7();
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const auditados: string[] = [];
let api: NestFastifyApplication;
const termos = termosEmMemoria();
const exportacoes = new ExportacoesEmMemoria();
const unidadeDaPrivacidade = new OutboxEmMemoria();
const armazenamento = {
  urlAssinada: (p: { caminho: string }) => Promise.resolve(`https://exemplo.invalid/${p.caminho}`),
} as unknown as ArmazenamentoArquivos;

const tokens = new Map<string, string>();
async function entrarComo(nome: string, perfil: CodigoPerfil, tenantId: string) {
  const usuarioId = gerarUuidV7();
  perfis.atribuir(usuarioId, perfil);
  const token = randomBytes(32).toString('base64url');
  const agora = relogio.agora();
  await sessoes.gravar(token, {
    id: gerarUuidV7(),
    usuarioId,
    tenantId: tenantId as never,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: agora,
    ultimoUso: agora,
  });
  tokens.set(nome, token);
}

const pedir = (quem: string, method: 'GET' | 'POST', url: string, payload?: object) =>
  api.inject({
    method,
    url,
    headers: { authorization: `Bearer ${tokens.get(quem) ?? ''}` },
    ...(payload === undefined ? {} : { payload }),
  });

beforeAll(async () => {
  api = await criarApi({
    termos: termos.dependencias,
    privacidade: {
      unidade: unidadeDaPrivacidade,
      exportacoes,
      trilha: { registrar: () => Promise.resolve() },
      outbox: unidadeDaPrivacidade,
      armazenamento,
      encerramentos: new EncerramentosEmTeste(),
    },
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
    tabelaDePrazos: (() => {
      const tabela = new TabelaEmMemoria();
      return {
        unidade: new OutboxEmMemoria(),
        tipos: tabela,
        tabela,
        trilha: {
          registrar: (tx, entrada) => {
            (tx as { aoConfirmar(f: () => void): void }).aoConfirmar(() =>
              auditados.push(entrada.tipo),
            );
            return Promise.resolve();
          },
        },
        outbox: new OutboxEmMemoria(),
      };
    })(),
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
  await entrarComo('ana', 'curador', PLATAFORMA);
  await entrarComo('beto', 'curador', PLATAFORMA);
  await entrarComo('caio', 'advogado', ESCRITORIO);
});

afterAll(async () => {
  await api.close();
});

describe('exportação de dados (HU38)', () => {
  it('titular pede, repete sem duplicar e consulta; escritório exige a permissão', async () => {
    const pedido = await pedir('caio', 'POST', '/v1/privacidade/exportacoes', {
      escopo: 'titular',
    });
    expect(pedido.statusCode).toBe(202);
    const { id } = pedido.json<{ id: string; nova: boolean }>();
    expect(pedido.json()).toMatchObject({ nova: true });
    expect(
      (await pedir('caio', 'POST', '/v1/privacidade/exportacoes', { escopo: 'titular' })).json(),
    ).toEqual({ id, nova: false });
    expect((await pedir('caio', 'GET', `/v1/privacidade/exportacoes/${id}`)).json()).toMatchObject({
      id,
      escopo: 'titular',
      situacao: 'pendente',
      arquivos: [],
    });
    // O advogado do seed tem escritorio:exportar; o curador não.
    expect(
      (await pedir('caio', 'POST', '/v1/privacidade/exportacoes', { escopo: 'escritorio' }))
        .statusCode,
    ).toBe(202);
    const negado = await pedir('ana', 'POST', '/v1/privacidade/exportacoes', {
      escopo: 'escritorio',
    });
    expect(negado.statusCode).toBe(403);
    expect(negado.json<{ codigo: string }>().codigo).toBe('exportacao-do-escritorio');
  });

  it('pedido de outro usuário é 404; escopo inválido é 400', async () => {
    const { id } = (
      await pedir('beto', 'POST', '/v1/privacidade/exportacoes', { escopo: 'titular' })
    ).json<{ id: string }>();
    expect((await pedir('ana', 'GET', `/v1/privacidade/exportacoes/${id}`)).statusCode).toBe(404);
    expect(
      (await pedir('ana', 'POST', '/v1/privacidade/exportacoes', { escopo: 'tudo' })).statusCode,
    ).toBe(400);
  });
});

describe('encerramento da conta (HU38)', () => {
  it('responsável pede, consulta e cancela; sem a permissão é 403', async () => {
    expect((await pedir('caio', 'GET', '/v1/privacidade/encerramento')).json()).toMatchObject({
      situacao: 'nenhum',
    });
    const pedido = await pedir('caio', 'POST', '/v1/privacidade/encerramento');
    expect(pedido.statusCode).toBe(202);
    expect(pedido.json()).toMatchObject({ situacao: 'em-carencia' });
    expect((await pedir('caio', 'POST', '/v1/privacidade/encerramento/cancelar')).statusCode).toBe(
      204,
    );
    expect((await pedir('caio', 'POST', '/v1/privacidade/encerramento/cancelar')).statusCode).toBe(
      404,
    );
    expect((await pedir('ana', 'POST', '/v1/privacidade/encerramento')).statusCode).toBe(403);
  });
});
