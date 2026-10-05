import { carregarAmbiente } from '@pz/config/env';
import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { ConsultarSituacao, HistoricoEmMemoria, RegistrarVerificacao } from '@pz/saude';
import { afterEach, describe, expect, it } from 'vitest';

import { esquemaWorker } from './ambiente.js';
import { DespachanteDeEventos } from './eventos/consome.js';
import { RelayDoOutbox } from './eventos/relay.js';
import { criarServidorDeSaude } from './saude/servidor.js';
import { criarWorker } from './worker.js';

import type { INestApplicationContext } from '@nestjs/common';
import type { EventoDominio } from '@pz/kernel';
import type { AddressInfo } from 'node:net';

const ambiente = carregarAmbiente(esquemaWorker, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:s@127.0.0.1:1/db',
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

async function subir(outbox = new OutboxEmMemoria()) {
  worker = await criarWorker({ ambiente, relogio, verificadores: [disponivel], outbox });
  await worker.init();
  return { worker, outbox };
}

describe('ambiente do worker', () => {
  it('lê WORKER_QUEUES como lista e recusa nomes inválidos', () => {
    expect(
      carregarAmbiente(esquemaWorker, { ...ambienteBruto(), WORKER_QUEUES: 'captura, email' })
        .WORKER_QUEUES,
    ).toEqual(['captura', 'email']);
    expect(carregarAmbiente(esquemaWorker, ambienteBruto()).WORKER_QUEUES).toEqual([]);
    expect(() =>
      carregarAmbiente(esquemaWorker, { ...ambienteBruto(), WORKER_QUEUES: 'Captura!' }),
    ).toThrow('WORKER_QUEUES');
  });
});

function ambienteBruto() {
  return {
    DATABASE_URL: 'postgresql://u:s@h:5432/d',
    REDIS_URL: 'redis://h:6379',
    S3_REGION: 'us-east-1',
  };
}

describe('@Consome e o despachante', () => {
  it('inscreve os consumidores declarados por tipo e versão', async () => {
    const { worker: app } = await subir();
    expect(app.get(DespachanteDeEventos).inscritos()).toEqual(
      new Map([['SituacaoVerificada@1', ['ConsumidorDeSituacao.tratar']]]),
    );
  });

  it('fluxo ponta a ponta: verificação → outbox → relay → consumidor, uma vez só', async () => {
    const { worker: app, outbox } = await subir();
    const registrar = new RegistrarVerificacao(app.get(ConsultarSituacao), outbox, outbox, relogio);
    const tenantId = gerarUuidV7(relogio);

    await registrar.executar(tenantId);
    const relay = app.get(RelayDoOutbox);
    expect(await relay.executarCiclo()).toBe(1);
    expect(await relay.executarCiclo()).toBe(0);

    const historico = app.get(HistoricoEmMemoria).entradas();
    expect(historico).toEqual([expect.objectContaining({ tenantId, situacao: 'operacional' })]);

    // Reentrega do mesmo evento (relay reiniciado): o consumidor não processa de novo.
    const evento: EventoDominio = {
      id: historico[0]?.eventoId ?? gerarUuidV7(),
      tipo: 'SituacaoVerificada',
      versao: 1,
      tenantId,
      agregadoId: 'x',
      ocorridoEm: relogio.agora(),
      payload: { situacao: 'operacional' },
    };
    expect(await app.get(DespachanteDeEventos).despachar(evento)).toEqual(['ignorado']);
    expect(app.get(HistoricoEmMemoria).entradas()).toHaveLength(1);
  });

  it('evento sem consumidor inscrito ou de outra versão não é entregue a ninguém', async () => {
    const { worker: app } = await subir();
    const base = {
      id: gerarUuidV7(),
      tenantId: gerarUuidV7(),
      agregadoId: 'x',
      ocorridoEm: relogio.agora(),
      payload: {},
    };
    expect(
      await app.get(DespachanteDeEventos).despachar({ ...base, tipo: 'Desconhecido', versao: 1 }),
    ).toEqual([]);
    expect(
      await app
        .get(DespachanteDeEventos)
        .despachar({ ...base, tipo: 'SituacaoVerificada', versao: 2 }),
    ).toEqual([]);
  });

  it('falha no consumo não derruba o relay: o lote volta e é retentado', async () => {
    const outbox = new OutboxEmMemoria();
    const { worker: app } = await subir(outbox);
    await new RegistrarVerificacao(app.get(ConsultarSituacao), outbox, outbox, relogio).executar(
      gerarUuidV7(),
    );
    outbox.falharAoMarcarPublicados = true;

    expect(await app.get(RelayDoOutbox).executarCiclo()).toBe(0);
    expect(outbox.pendentes()).toHaveLength(1);

    outbox.falharAoMarcarPublicados = false;
    expect(await app.get(RelayDoOutbox).executarCiclo()).toBe(1);
    expect(app.get(HistoricoEmMemoria).entradas()).toHaveLength(1);
  });

  it('não roda dois ciclos ao mesmo tempo', async () => {
    const outbox = new OutboxEmMemoria();
    const { worker: app } = await subir(outbox);
    await new RegistrarVerificacao(app.get(ConsultarSituacao), outbox, outbox, relogio).executar(
      gerarUuidV7(),
    );
    const relay = app.get(RelayDoOutbox);

    const resultados = await Promise.all([relay.executarCiclo(), relay.executarCiclo()]);

    expect(resultados).toEqual([1, 0]);
    expect(app.get(HistoricoEmMemoria).entradas()).toHaveLength(1);
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
      worker = await criarWorker({ ambiente: { ...ambiente, ...extra }, relogio });
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
