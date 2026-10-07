import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';
import { carregarAmbiente } from '@pz/config/env';
import { Banco, executarNoTenant, OutboxPostgres, WebhooksPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { CifraAesGcm } from '@pz/identidade';
import { gerarUuidV7, SystemClock } from '@pz/kernel';
import { executarComContexto, iniciarTelemetria } from '@pz/observability';
import { HistoricoEmMemoria } from '@pz/saude';
import { RedisContainer } from '@testcontainers/redis';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaWorker } from './ambiente.js';
import { DespachanteDeEventos } from './eventos/consome.js';
import { RelayDoOutbox } from './eventos/relay.js';
import { AMBIENTE, FILAS_RUNTIME, FONTE_DO_RELAY, RELOGIO, UNIDADE_DO_RELAY } from './fichas.js';
import { limparOutboxJob } from './filas/agendamento.js';
import { idDoJob } from './filas/job.js';
import { criarWorker } from './worker.js';

import type { FonteDoRelay } from './eventos/relay.js';
import type { Filas } from './filas/runtime.js';
import type { INestApplicationContext } from '@nestjs/common';
import type { BancoDeTeste } from '@pz/db/teste';
import type { EventoDominio, Uuid } from '@pz/kernel';
import type { Telemetria } from '@pz/observability';
import type { StartedRedisContainer } from '@testcontainers/redis';

// Dados fictícios de teste.
const TENANT = '01a10e00-0000-7000-8000-0000000e2e01' as Uuid;
const USUARIO_E2E = '01a10e00-0000-7000-8000-0000000e2e02' as Uuid;

let postgres: BancoDeTeste;
let redis: StartedRedisContainer;
let worker: INestApplicationContext;
let banco: Banco;
let telemetria: Telemetria;
const spans = new InMemorySpanExporter();
const webhooksProcessados: string[] = [];
const emailsEnviados: { para: readonly string[]; texto: string; idempotencia: string }[] = [];

function novoEvento(agregadoId: string): EventoDominio {
  return {
    id: gerarUuidV7(),
    tipo: 'SituacaoVerificada',
    versao: 1,
    tenantId: TENANT,
    agregadoId,
    ocorridoEm: new SystemClock().agora(),
    payload: { situacao: 'operacional' },
  };
}

async function gravarNoOutbox(eventos: EventoDominio[]): Promise<void> {
  await executarNoTenant(TENANT, () =>
    banco.executar((tx) => new OutboxPostgres().gravar(tx, eventos)),
  );
}

/** Situação de cada evento no banco: publicado? quantas vezes processado? */
async function situacaoNoBanco(
  ids: readonly string[],
): Promise<{ publicado: boolean; processados: number }[]> {
  const conexao = await postgres.conectar('pz_sistema');
  const { rows } = await conexao.query<{ publicado: boolean; processados: number }>(
    `SELECT publicado_em IS NOT NULL AS publicado,
            (SELECT count(*)::int FROM evento_processado p WHERE p.evento_id = e.id) AS processados
       FROM evento_dominio e WHERE e.id = ANY($1::uuid[]) ORDER BY e.id`,
    [ids],
  );
  await conexao.end();
  return rows;
}

/** Relay montado à mão com as dependências do worker (para controlar os ciclos no teste). */
function novoRelay(fonte?: FonteDoRelay<unknown>): RelayDoOutbox {
  return new RelayDoOutbox(
    worker.get(AMBIENTE),
    worker.get(UNIDADE_DO_RELAY),
    fonte ?? worker.get(FONTE_DO_RELAY),
    worker.get(RELOGIO),
    worker.get(DespachanteDeEventos),
    worker.get(FILAS_RUNTIME),
  );
}

async function esperar(
  condicao: () => boolean | Promise<boolean>,
  limiteMs = 20_000,
): Promise<void> {
  const limite = performance.now() + limiteMs;
  while (!(await condicao())) {
    if (performance.now() > limite) throw new Error('condição não atingida a tempo');
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
}

beforeAll(async () => {
  [postgres, redis] = await Promise.all([
    subirBancoDeTeste(),
    new RedisContainer('redis:8.6.7-alpine').start(),
  ]);
  await postgres.migrar();
  const sistema = await postgres.conectar('pz_sistema');
  await sistema.query(
    `INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'Escritório E2E', 'escritorio')`,
    [TENANT],
  );
  await sistema.query(
    `INSERT INTO usuario (id, tenant_id, nome, email) VALUES ($1, $2, 'Pessoa E2E', 'e2e@exemplo.invalid')`,
    [USUARIO_E2E, TENANT],
  );
  await sistema.end();

  telemetria = iniciarTelemetria({
    servico: 'pz-worker-teste',
    versao: 't',
    ambiente: 'test',
    exportadorDeSpans: spans,
  });
  const ambiente = carregarAmbiente(esquemaWorker, {
    NODE_ENV: 'test',
    DATABASE_URL: postgres.url('pz_app'),
    DATABASE_URL_SISTEMA: postgres.url('pz_sistema'),
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    CHAVE_CIFRAGEM: 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=',
    REDIS_URL: redis.getConnectionUrl(),
    S3_REGION: 'us-east-1',
    RELAY_INTERVALO_MS: '100',
  });
  worker = await criarWorker({
    ambiente,
    email: {
      enviar: (email) => {
        emailsEnviados.push(email);
        return Promise.resolve({ idExterno: 'teste', aceitoEm: new SystemClock().agora() });
      },
      saude: () =>
        Promise.resolve({ estado: 'operacional', verificadoEm: new SystemClock().agora() }),
    },
    processadoresDeWebhook: new Map([
      [
        'teste',
        (_tx, webhook) => {
          webhooksProcessados.push(webhook.idExterno);
          return Promise.resolve();
        },
      ],
    ]),
  });
  await worker.init();
  banco = new Banco({ url: postgres.url('pz_app') });
}, 300_000);

afterAll(async () => {
  await worker.close();
  await banco.encerrar();
  await telemetria.encerrar();
  await Promise.all([postgres.parar(), redis.stop()]);
});

describe('relay do outbox → fila → consumidor (HU10, ponta a ponta)', () => {
  it('o evento gravado numa requisição chega ao consumidor em < 2 s, uma vez, no mesmo trace', async () => {
    const evento = novoEvento('verificacao-e2e');

    // "Requisição HTTP": span de origem + correlação + tenant; o caso de uso grava no outbox.
    const inicio = performance.now();
    const traceId = await trace
      .getTracer('teste')
      .startActiveSpan('POST /v1/exemplo', async (span) => {
        await executarComContexto({ requestId: 'req-e2e' }, () => gravarNoOutbox([evento]));
        span.end();
        return span.spanContext().traceId;
      });

    const historico = worker.get(HistoricoEmMemoria);
    await esperar(() => historico.entradas().length === 1);
    const latenciaMs = performance.now() - inicio;

    expect(historico.entradas()).toEqual([
      expect.objectContaining({ eventoId: evento.id, tenantId: TENANT, situacao: 'operacional' }),
    ]);
    expect(latenciaMs).toBeLessThan(2_000);

    // Um único trace: o consumo do job continua o trace da requisição de origem.
    await esperar(() => spans.getFinishedSpans().some((s) => s.name === 'eventos process'));
    const consumo = spans.getFinishedSpans().find((s) => s.name === 'eventos process');
    expect(consumo?.spanContext().traceId).toBe(traceId);
    expect(consumo?.attributes).toMatchObject({ 'pz.tenant.id': TENANT });

    // Marcado como publicado e registrado como processado (uma vez).
    expect(await situacaoNoBanco([evento.id])).toEqual([{ publicado: true, processados: 1 }]);
  }, 60_000);
});

describe('relay do outbox sob falha e concorrência (HU10)', () => {
  beforeAll(async () => {
    // Para o relay automático do worker: aqui cada ciclo é disparado pelo teste.
    await worker.get(RelayDoOutbox).onApplicationShutdown();
  });

  it('relay que cai entre publicar e marcar: o evento volta ao outbox e é processado uma vez', async () => {
    const evento = novoEvento('relay-cai');
    await gravarNoOutbox([evento]);
    const historico = worker.get(HistoricoEmMemoria);
    const antes = historico.entradas().length;

    // Publica na fila e "cai" antes de marcar: a transação não confirma.
    const real = worker.get<FonteDoRelay<unknown>>(FONTE_DO_RELAY);
    const quebrada: FonteDoRelay<unknown> = {
      reservarPendentesComContexto: (tx, limite) => real.reservarPendentesComContexto(tx, limite),
      marcarPublicados: () => Promise.reject(new Error('relay caiu antes de marcar')),
    };
    expect(await novoRelay(quebrada).executarCiclo()).toBe(0);
    await esperar(() => historico.entradas().length === antes + 1);
    expect(await situacaoNoBanco([evento.id])).toEqual([{ publicado: false, processados: 1 }]);

    // Pior caso: o job concluído já saiu do Redis, então a republicação cria um job novo.
    // Só a deduplicação por consumidor (evento_processado) impede o segundo efeito.
    const [consumidor] = worker.get(DespachanteDeEventos).consumidoresDe(evento);
    const fila = new Queue('eventos', { connection: { url: redis.getConnectionUrl() } });
    const idJob = idDoJob('eventos.consumir', `${String(consumidor)}:${evento.id}`);
    await (await fila.getJob(idJob))?.remove();

    expect(await novoRelay().executarCiclo()).toBe(1);
    await esperar(async () => (await fila.getJob(idJob))?.finishedOn !== undefined);
    await fila.close();

    expect(historico.entradas().length).toBe(antes + 1);
    expect(await situacaoNoBanco([evento.id])).toEqual([{ publicado: true, processados: 1 }]);
  }, 60_000);

  it('dois relays concorrentes não reservam o mesmo evento nem duplicam o consumo', async () => {
    const eventos = Array.from({ length: 30 }, (_, i) => novoEvento(`concorrente-${String(i)}`));
    await gravarNoOutbox(eventos);
    const historico = worker.get(HistoricoEmMemoria);
    const antes = historico.entradas().length;

    const publicados = await Promise.all([
      novoRelay().executarCiclo(),
      novoRelay().executarCiclo(),
    ]);

    // SKIP LOCKED: cada evento foi reservado por exatamente um dos relays.
    expect(publicados[0] + publicados[1]).toBe(eventos.length);
    await esperar(() => historico.entradas().length === antes + eventos.length);
    const ids = new Set(
      historico
        .entradas()
        .slice(antes)
        .map((entrada) => entrada.eventoId),
    );
    expect(ids.size).toBe(eventos.length);
    expect(await situacaoNoBanco(eventos.map((e) => e.id))).toEqual(
      eventos.map(() => ({ publicado: true, processados: 1 })),
    );
  }, 60_000);
});

describe('jobs recorrentes no worker (HU10)', () => {
  it('o boot registra a limpeza diária do outbox às 3h de Brasília', async () => {
    const fila = new Queue('manutencao', { connection: { url: redis.getConnectionUrl() } });
    // Registrado em segundo plano no boot (não espera o Redis).
    await esperar(
      async () => (await fila.getJobScheduler('manutencao.limpar-outbox')) !== undefined,
    );
    expect(await fila.getJobScheduler('manutencao.limpar-outbox')).toMatchObject({
      pattern: '0 3 * * *',
      tz: 'America/Sao_Paulo',
    });
    await fila.close();
  });

  it('a limpeza remove do banco os eventos publicados há mais de 30 dias', async () => {
    const [antigo, recente] = [novoEvento('limpeza-antigo'), novoEvento('limpeza-recente')];
    await gravarNoOutbox([antigo, recente]);
    const sistema = await postgres.conectar('pz_sistema');
    await sistema.query(
      `UPDATE evento_dominio SET publicado_em = now() - interval '31 days' WHERE id = $1`,
      [antigo.id],
    );
    await sistema.query(`UPDATE evento_dominio SET publicado_em = now() WHERE id = $1`, [
      recente.id,
    ]);

    // Dispara a execução do job agendado sem esperar as 3h.
    await worker
      .get<Filas>(FILAS_RUNTIME)
      .publicar(limparOutboxJob, {}, { global: true, motivo: 'teste da limpeza' }, 'e2e');

    const existentes = async () =>
      (
        await sistema.query<{ id: string }>(
          'SELECT id FROM evento_dominio WHERE id = ANY($1::uuid[])',
          [[antigo.id, recente.id]],
        )
      ).rows.map((linha) => linha.id);
    await esperar(async () => !(await existentes()).includes(antigo.id));
    expect(await existentes()).toEqual([recente.id]);
    await sistema.end();
  }, 60_000);
});

describe('webhooks de entrada no worker (HU09)', () => {
  const gravar = (adaptador: string, idExterno: string) =>
    banco.executarSemTenant('webhook de entrada', (tx) =>
      new WebhooksPostgres().gravar(tx, {
        adaptador,
        idExterno,
        cabecalhos: {},
        corpo: new TextEncoder().encode('{}'),
      }),
    );

  it('o webhook gravado pela api é processado uma vez e marcado; sem processador vai para a DLQ', async () => {
    expect(await gravar('teste', 'wh-1')).toBe(true);
    expect(await gravar('teste', 'wh-1')).toBe(false);
    expect(await gravar('sem-processador', 'wh-2')).toBe(true);

    await esperar(() => webhooksProcessados.includes('wh-1'));
    const sistema = await postgres.conectar('pz_sistema');
    const processado = async (id: string) =>
      (
        await sistema.query<{ ok: boolean }>(
          'SELECT processado_em IS NOT NULL AS ok FROM webhook_recebido WHERE id_externo = $1',
          [id],
        )
      ).rows[0]?.ok;
    await esperar(async () => (await processado('wh-1')) === true);

    const dlq = new Queue('integracoes-dlq', { connection: { url: redis.getConnectionUrl() } });
    await esperar(async () => ((await dlq.getJobCounts('wait')).wait ?? 0) === 1);
    await dlq.close();
    expect(await processado('wh-2')).toBe(false);
    expect(webhooksProcessados).toEqual(['wh-1']);
    await sistema.end();
  }, 60_000);
});

describe('e-mails de segurança pelo worker (HU06)', () => {
  it('RedefinicaoDeSenhaSolicitada no outbox vira e-mail com o link, para o e-mail do usuário, uma vez', async () => {
    const id = gerarUuidV7();
    await executarNoTenant(TENANT, () =>
      banco.executar((tx) =>
        new OutboxPostgres().gravar(tx, [
          {
            id,
            tipo: 'RedefinicaoDeSenhaSolicitada',
            versao: 1,
            tenantId: TENANT,
            agregadoId: USUARIO_E2E,
            ocorridoEm: new SystemClock().agora(),
            payload: {
              usuarioId: USUARIO_E2E,
              tokenCifrado: new CifraAesGcm('MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=').cifrar(
                'token-do-link',
              ),
            },
          },
        ]),
      ),
    );
    // O relay automático foi parado no bloco anterior: um ciclo manual publica o evento.
    await novoRelay().executarCiclo();
    await esperar(() => emailsEnviados.some((e) => e.idempotencia === id));
    const enviados = emailsEnviados.filter((e) => e.idempotencia === id);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.para).toEqual(['e2e@exemplo.invalid']);
    expect(enviados[0]?.texto).toContain('/redefinir-senha#token=token-do-link');
    // O mesmo evento entrou na trilha de auditoria do tenant (HU08), sem o token.
    const sistema = await postgres.conectar('pz_sistema');
    await esperar(
      async () =>
        ((
          await sistema.query('SELECT 1 FROM evento_auditoria WHERE entidade_id = $1', [
            USUARIO_E2E,
          ])
        ).rowCount ?? 0) === 1,
    );
    const { rows } = await sistema.query<{ tipo: string; depois: unknown }>(
      'SELECT tipo, depois FROM evento_auditoria WHERE entidade_id = $1',
      [USUARIO_E2E],
    );
    await sistema.end();
    expect(rows).toEqual([{ tipo: 'identidade.redefinicao-de-senha-solicitada', depois: null }]);
  }, 60_000);
});
