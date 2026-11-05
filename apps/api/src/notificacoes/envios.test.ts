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
import { EnviosEmMemoria, NotificacoesEmMemoria } from '@pz/notificacoes';
import { TabelaEmMemoria } from '@pz/prazos';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { EntradaDeAuditoria } from '@pz/auditoria';
import type { CodigoPerfil } from '@pz/identidade';

/** Envio manual por e-mail (HU32) pela API: sigilo, recurso e permissão. Dados FICTÍCIOS. */
const PLATAFORMA = gerarUuidV7();
const ESCRITORIO = gerarUuidV7();
const PRAZO = gerarUuidV7();
const relogio = new FixedClock(Instant.deIso('2026-11-03T15:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const envios = new EnviosEmMemoria(new NotificacoesEmMemoria(), relogio);
const auditados: EntradaDeAuditoria[] = [];
let api: NestFastifyApplication;
const termos = termosEmMemoria();
const unidade = new OutboxEmMemoria();

const tokens = new Map<string, string>();
async function entrarComo(
  nome: string,
  perfil: CodigoPerfil,
  tenantId: string,
  dispositivoId?: string,
) {
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
    ...(dispositivoId === undefined ? {} : { dispositivoId: dispositivoId as never }),
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
    envios: {
      unidade,
      emails: {
        internos: (_tx, emails) =>
          Promise.resolve(new Set(emails.filter((e) => e.endsWith('@escritorio.invalid')))),
      },
      existe: (_tx, _recurso, id) => Promise.resolve(id === PRAZO),
      trilha: {
        registrar: (_tx, entrada) => {
          auditados.push(entrada);
          return Promise.resolve();
        },
      },
      outbox: unidade,
      envios,
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
        trilha: { registrar: () => Promise.resolve() },
        outbox: new OutboxEmMemoria(),
      };
    })(),
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
  await entrarComo('ana', 'advogado', ESCRITORIO);
  await entrarComo('beto', 'advogado', ESCRITORIO);
  await entrarComo('cura', 'curador', PLATAFORMA);
  await entrarComo('app', 'advogado', ESCRITORIO, gerarUuidV7());
});

afterAll(async () => {
  await api.close();
});

describe('envio manual por e-mail (HU32)', () => {
  const prazo = (extra: object) => ({ recurso: 'prazo', recursoId: PRAZO, ...extra });

  it('destinatário de fora sem confirmação: 422 e nada é gravado', async () => {
    const r = await pedir(
      'ana',
      'POST',
      '/v1/envios',
      prazo({ destinatarios: ['x@fora.invalid'] }),
    );
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ codigo: 'confirmacao-de-sigilo' });
    expect(auditados).toHaveLength(0);
    expect(unidade.pendentes()).toHaveLength(0);
  });

  it('com a confirmação: 202, trilha com destinatários e evento para o worker', async () => {
    const r = await pedir(
      'ana',
      'POST',
      '/v1/envios',
      prazo({
        destinatarios: ['Bia@Escritorio.invalid', 'x@fora.invalid'],
        confirmacaoSigilo: true,
        mensagem: 'Pode cuidar?',
      }),
    );
    expect(r.statusCode).toBe(202);
    const { id, externos } = r.json<{ id: string; externos: string[] }>();
    expect(externos).toEqual(['x@fora.invalid']);
    expect(auditados.at(-1)).toMatchObject({
      tipo: 'notificacoes.envio-manual-solicitado',
      entidadeId: id,
      depois: {
        recurso: 'prazo',
        destinatarios: ['bia@escritorio.invalid', 'x@fora.invalid'],
        externos: ['x@fora.invalid'],
        confirmacaoSigilo: true,
      },
    });
    expect(unidade.pendentes().at(-1)).toMatchObject({
      tipo: 'EnvioManualSolicitado',
      payload: {
        envioId: id,
        anexo: { origem: 'prazo', id: PRAZO, formato: 'pdf' },
        mensagem: 'Pode cuidar?',
      },
    });
  });

  it('só internos não pede confirmação; recurso inexistente é 404; inválido é 400', async () => {
    expect(
      (
        await pedir(
          'ana',
          'POST',
          '/v1/envios',
          prazo({ destinatarios: ['bia@escritorio.invalid'] }),
        )
      ).statusCode,
    ).toBe(202);
    expect(
      (
        await pedir('ana', 'POST', '/v1/envios', {
          recurso: 'publicacao',
          recursoId: gerarUuidV7(),
          destinatarios: ['bia@escritorio.invalid'],
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await pedir('ana', 'POST', '/v1/envios', prazo({ destinatarios: [] }))).statusCode,
    ).toBe(400);
  });

  it('busca não exige recurso existente; quem não exporta não envia', async () => {
    expect(
      (
        await pedir('ana', 'POST', '/v1/envios', {
          recurso: 'busca',
          alvo: 'prazos',
          filtros: { tribunal: 'TJGO' },
          formato: 'xlsx',
          destinatarios: ['bia@escritorio.invalid'],
        })
      ).statusCode,
    ).toBe(202);
    expect(
      (
        await pedir(
          'cura',
          'POST',
          '/v1/envios',
          prazo({ destinatarios: ['a@escritorio.invalid'] }),
        )
      ).statusCode,
    ).toBe(403);
    // Pelo app, a trilha registra o canal do app.
    expect(
      (await pedir('app', 'POST', '/v1/envios', prazo({ destinatarios: ['a@escritorio.invalid'] })))
        .statusCode,
    ).toBe(202);
  });
});

describe('situação dos envios (PZ-361)', () => {
  it('cada um vê só os próprios envios, do mais recente para o mais antigo', async () => {
    const r = await pedir('beto', 'POST', '/v1/envios', {
      recurso: 'prazo',
      recursoId: PRAZO,
      destinatarios: ['ana@escritorio.invalid', 'b@escritorio.invalid'],
    });
    expect(r.statusCode).toBe(202);
    const lista = await pedir('beto', 'GET', '/v1/envios');
    expect(lista.statusCode).toBe(200);
    expect(lista.json()).toMatchObject({
      itens: [
        {
          id: r.json<{ id: string }>().id,
          recurso: 'prazo',
          destinatarios: 2,
          situacao: 'pendente',
        },
      ],
    });
    expect((await pedir('cura', 'GET', '/v1/envios')).statusCode).toBe(403);
  });
});
