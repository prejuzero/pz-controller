import { carregarAmbiente } from '@pz/config/env';
import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { EnviarNotificacao } from '@pz/notificacoes';
import { ConsultarSituacao, HistoricoEmMemoria, RegistrarVerificacao } from '@pz/saude';
import { afterEach, describe, expect, it } from 'vitest';

import { esquemaWorker } from './ambiente.js';
import { DespachanteDeEventos } from './eventos/consome.js';
import { PROCESSADORES_DE_WEBHOOK } from './fichas.js';
import { ConsumidorDeNotificacoes } from './notificacoes/consumidor.js';
import { criarServidorDeSaude } from './saude/servidor.js';
import { criarWorker } from './worker.js';

import type { INestApplicationContext } from '@nestjs/common';
import type { AlteracaoDoCalendario, CacheDeDiasNaoUteis } from '@pz/calendario';
import type { EventoDominio } from '@pz/kernel';
import type { AddressInfo } from 'node:net';

const ambiente = carregarAmbiente(esquemaWorker, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:s@127.0.0.1:1/db',
  DATABASE_URL_SISTEMA: 'postgresql://u:s@127.0.0.1:1/db',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  CHAVE_CIFRAGEM: 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_REGION: 'us-east-1',
  VERSAO: 'abc123',
  RELAY_INTERVALO_MS: '60000',
});
const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));
const disponivel = { nome: 'banco', verificar: () => Promise.resolve() };

let worker: INestApplicationContext | undefined;
afterEach(async () => {
  await worker?.close();
  worker = undefined;
});

const invalidacoes: AlteracaoDoCalendario[] = [];
const cacheDoCalendario: CacheDeDiasNaoUteis = {
  doAno: (_jurisdicao, _ano, calcular) => calcular(),
  invalidar: (alteracao) => {
    invalidacoes.push(alteracao);
    return Promise.resolve();
  },
};

async function subir(outbox = new OutboxEmMemoria(), ajustes: Partial<typeof ambiente> = {}) {
  worker = await criarWorker({
    ambiente: { ...ambiente, ...ajustes },
    relogio,
    verificadores: [disponivel],
    outbox,
    filas: false,
    cacheDoCalendario,
  });
  await worker.init();
  return { worker, outbox };
}

describe('e-mail e webhooks de entrega pela configuração (HU30)', () => {
  const TOPICO = 'arn:aws:sns:sa-east-1:000000000000:pz-entregas';

  it('SMTP sem tópico: nenhum processador de webhook', async () => {
    const { worker: app } = await subir();
    expect([...app.get<ReadonlyMap<string, unknown>>(PROCESSADORES_DE_WEBHOOK).keys()]).toEqual([]);
  });

  it('SES com credenciais e tópico SNS: envio pelo SES e processador do webhook ses', async () => {
    const { worker: app } = await subir(new OutboxEmMemoria(), {
      EMAIL_PROVEDOR: 'ses',
      SES_SMTP_USUARIO: 'usuario-teste',
      SES_SMTP_SENHA: 'senha-teste',
      SES_TOPICOS_SNS: [TOPICO],
    });
    expect([...app.get<ReadonlyMap<string, unknown>>(PROCESSADORES_DE_WEBHOOK).keys()]).toEqual([
      'ses',
    ]);
    expect(app.get(EnviarNotificacao)).toBeInstanceOf(EnviarNotificacao);
  });

  it('SES sem credenciais não sobe', async () => {
    await expect(subir(new OutboxEmMemoria(), { EMAIL_PROVEDOR: 'ses' })).rejects.toThrow(
      'SES_SMTP_USUARIO',
    );
  });
});

describe('ambiente do worker', () => {
  it('lê WORKER_QUEUES como lista e recusa nomes inválidos', () => {
    expect(
      carregarAmbiente(esquemaWorker, {
        ...ambienteBruto(),
        WORKER_QUEUES: 'captura, notificacoes',
      }).WORKER_QUEUES,
    ).toEqual(['captura', 'notificacoes']);
    expect(carregarAmbiente(esquemaWorker, ambienteBruto()).WORKER_QUEUES).toEqual([]);
    expect(() =>
      carregarAmbiente(esquemaWorker, { ...ambienteBruto(), WORKER_QUEUES: 'Captura!' }),
    ).toThrow('WORKER_QUEUES');
  });
});

function ambienteBruto() {
  return {
    DATABASE_URL: 'postgresql://u:s@h:5432/d',
    DATABASE_URL_SISTEMA: 'postgresql://s:s@h:5432/d',
    REDIS_URL: 'redis://h:6379',
    S3_REGION: 'us-east-1',
    SMTP_HOST: 'h',
    SMTP_PORT: '1025',
    CHAVE_CIFRAGEM: 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=',
  };
}

describe('@Consome e o despachante', () => {
  it('inscreve os consumidores declarados por tipo e versão', async () => {
    const { worker: app } = await subir();
    expect(app.get(DespachanteDeEventos).inscritos()).toEqual(
      new Map([
        ['SituacaoVerificada@1', ['ConsumidorDeSituacao.tratar']],
        [
          'RedefinicaoDeSenhaSolicitada@1',
          [
            'ConsumidorDeAvisosDeIdentidade.redefinicao',
            'ConsumidorDeAuditoria.redefinicaoSolicitada',
          ],
        ],
        ['VerificacaoDeEmailSolicitada@1', ['ConsumidorDeAvisosDeIdentidade.verificacaoDeEmail']],
        [
          'ContaBloqueada@1',
          ['ConsumidorDeAvisosDeIdentidade.bloqueio', 'ConsumidorDeAuditoria.contaBloqueada'],
        ],
        ['DispositivoRegistrado@1', ['ConsumidorDeAuditoria.dispositivoRegistrado']],
        ['SessaoRevogada@1', ['ConsumidorDeAuditoria.sessaoRevogada']],
        ['CalendarioAlterado@1', ['ConsumidorDoCalendario.alterado']],
        ['NotificacaoSolicitada@1', ['ConsumidorDeNotificacoes.solicitada']],
        ['NotificacaoRejeitada@1', ['ConsumidorDeAuditoria.notificacaoRejeitada']],
      ]),
    );
  });

  it('verificação → outbox → consumidor inscrito, uma vez só por consumidor', async () => {
    const { worker: app, outbox } = await subir();
    const despachante = app.get(DespachanteDeEventos);
    const tenantId = gerarUuidV7(relogio);
    await new RegistrarVerificacao(app.get(ConsultarSituacao), outbox, outbox, relogio).executar(
      tenantId,
    );
    const [evento] = outbox.pendentes();
    if (evento === undefined) throw new Error('evento não gravado');

    expect(despachante.consumidoresDe(evento)).toEqual(['ConsumidorDeSituacao.tratar']);
    expect(await despachante.consumir('ConsumidorDeSituacao.tratar', evento)).toBe('processado');
    // Reentrega (relay reiniciado, job repetido): o consumidor não processa de novo.
    expect(await despachante.consumir('ConsumidorDeSituacao.tratar', evento)).toBe('ignorado');
    expect(await despachante.despachar(evento)).toEqual(['ignorado']);

    expect(app.get(HistoricoEmMemoria).entradas()).toEqual([
      expect.objectContaining({ tenantId, situacao: 'operacional' }),
    ]);
  });

  it('CalendarioAlterado invalida o cache dos anos alcançados (HU13)', async () => {
    const { worker: app } = await subir();
    const tenantId = gerarUuidV7(relogio);
    const evento: EventoDominio = {
      id: gerarUuidV7(relogio),
      tipo: 'CalendarioAlterado',
      versao: 1,
      tenantId,
      agregadoId: gerarUuidV7(relogio),
      ocorridoEm: relogio.agora(),
      payload: { origem: 'local', inicio: '2030-12-20', fim: '2031-01-20' },
    };
    expect(await app.get(DespachanteDeEventos).despachar(evento)).toEqual(['processado']);
    expect(invalidacoes.at(-1)).toEqual({ origem: 'local', tenantId, anos: [2030, 2031] });
  });

  it('evento sem consumidor inscrito, de outra versão ou consumidor desconhecido', async () => {
    const { worker: app } = await subir();
    const despachante = app.get(DespachanteDeEventos);
    const base: EventoDominio = {
      id: gerarUuidV7(),
      tipo: 'Desconhecido',
      versao: 1,
      tenantId: gerarUuidV7(),
      agregadoId: 'x',
      ocorridoEm: relogio.agora(),
      payload: {},
    };
    expect(despachante.consumidoresDe(base)).toEqual([]);
    expect(await despachante.despachar(base)).toEqual([]);
    expect(despachante.consumidoresDe({ ...base, tipo: 'SituacaoVerificada', versao: 2 })).toEqual(
      [],
    );
    await expect(despachante.consumir('Fantasma.tratar', base)).rejects.toThrow('não inscrito');
  });
});

describe('servidor de saúde do worker', () => {
  it('responde live, ready (200/503), 404 e 405', async () => {
    const indisponivel = { nome: 'redis', verificar: () => Promise.reject(new Error('fora')) };
    for (const [verificadores, esperado] of [
      [[disponivel], 200],
      [[disponivel, indisponivel], 503],
    ] as const) {
      const servidor = criarServidorDeSaude(
        new ConsultarSituacao(verificadores, relogio, 'abc123'),
      );
      await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
      const base = `http://127.0.0.1:${String((servidor.address() as AddressInfo).port)}`;

      expect((await fetch(`${base}/health/live`)).status).toBe(200);
      expect((await fetch(`${base}/health/ready`)).status).toBe(esperado);
      expect((await fetch(`${base}/outra`)).status).toBe(404);
      expect((await fetch(`${base}/health/live`, { method: 'POST' })).status).toBe(405);
      await new Promise((resolver) => servidor.close(resolver));
    }
  });
});

describe('verificadores do ambiente', () => {
  it('sem substituição, monta banco, Redis e (se configurado) o armazenamento', async () => {
    for (const extra of [{}, { S3_ENDPOINT: 'http://127.0.0.1:1' }]) {
      worker = await criarWorker({ ambiente: { ...ambiente, ...extra }, relogio, filas: false });
      await worker.init();
      const relatorio = await worker.get(ConsultarSituacao).executar();
      expect(relatorio.dependencias.map((d) => d.dependencia)).toEqual(
        'S3_ENDPOINT' in extra ? ['banco', 'redis', 'armazenamento'] : ['banco', 'redis'],
      );
      await worker.close();
      worker = undefined;
    }
  });
});

describe('notificações (HU30)', () => {
  it('NotificacaoSolicitada envia pelo ProvedorEmail com a chave de idempotência', async () => {
    const enviados: { idempotencia: string; para: string[] }[] = [];
    worker = await criarWorker({
      ambiente,
      relogio,
      verificadores: [disponivel],
      outbox: new OutboxEmMemoria(),
      filas: false,
      cacheDoCalendario,
      email: {
        enviar: (email) => {
          enviados.push({ idempotencia: email.idempotencia, para: email.para });
          return Promise.resolve({ idExterno: 'ext-1', aceitoEm: relogio.agora() });
        },
        saude: () => Promise.resolve({ estado: 'operacional', verificadoEm: relogio.agora() }),
      },
    });
    await worker.init();
    const id = gerarUuidV7(relogio);
    const atualizados: unknown[] = [];
    // Transação falsa no formato do Prisma: só o que o repositório usa.
    const transacao = {
      notificacao: {
        findUnique: () =>
          Promise.resolve({
            id,
            tenantId: id,
            usuarioId: id,
            prazoId: null,
            canal: 'email',
            tipo: 'nova-intimacao',
            chaveIdempotencia: 'chave-1',
            versaoTemplate: 1,
            destinatarios: ['ana@exemplo.invalid'],
            dados: { numeroProcesso: '1', link: 'https://app.exemplo.invalid/x' },
            enviadaEm: null,
            idExterno: null,
            entregueEm: null,
            abertaEm: null,
            rejeitadaEm: null,
            motivoRejeicao: null,
          }),
        update: (args: unknown) => {
          atualizados.push(args);
          return Promise.resolve({});
        },
      },
    };
    await worker.get(ConsumidorDeNotificacoes).solicitada(transacao as never, {
      id,
      tipo: 'NotificacaoSolicitada',
      versao: 1,
      tenantId: id,
      agregadoId: id,
      ocorridoEm: relogio.agora(),
      payload: { notificacaoId: id, canal: 'email', tipo: 'nova-intimacao' },
    });
    expect(enviados).toEqual([{ idempotencia: 'chave-1', para: ['ana@exemplo.invalid'] }]);
    expect(atualizados).toHaveLength(1);
  });
});
