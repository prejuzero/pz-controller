import { tenantAtual } from '@pz/db';
import { FixedClock, Instant } from '@pz/kernel';
import { executarComContexto, obterContexto } from '@pz/observability';
import { RedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { definirJob, filaDlq } from './job.js';
import { Filas } from './runtime.js';

import type { OpcoesFilas } from './runtime.js';
import type { StartedRedisContainer } from '@testcontainers/redis';

// Dados fictícios de teste.
const TENANT = '01a10e00-0000-7000-8000-0000000f0001';
const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));

let conteiner: StartedRedisContainer;
const abertas: Filas[] = [];
const conexoes: Redis[] = [];

function conectar(): Redis {
  // BullMQ exige maxRetriesPerRequest: null nas conexões dos workers.
  const redis = new Redis(conteiner.getConnectionUrl(), { maxRetriesPerRequest: null });
  conexoes.push(redis);
  return redis;
}

function filas(opcoes: Partial<OpcoesFilas> = {}): Filas {
  const instancia = new Filas({
    redis: conectar(),
    relogio,
    filasAtivas: ['prazos'],
    atrasoBaseMs: 10,
    ...opcoes,
  });
  abertas.push(instancia);
  return instancia;
}

async function esperar(
  condicao: () => boolean | Promise<boolean>,
  limiteMs = 15_000,
): Promise<void> {
  const limite = performance.now() + limiteMs;
  while (!(await condicao())) {
    if (performance.now() > limite) throw new Error('condição não atingida a tempo');
    await new Promise((resolver) => setTimeout(resolver, 25));
  }
}

const recalcular = definirJob({
  fila: 'prazos',
  tipo: 'prazos.recalcular',
  dados: z.object({ prazoId: z.string() }),
});
const varrer = definirJob({
  fila: 'manutencao',
  tipo: 'manutencao.varrer',
  dados: z.object({}),
  global: true,
});

beforeAll(async () => {
  conteiner = await new RedisContainer('redis:8.6.7-alpine').start();
}, 300_000);

afterEach(async () => {
  await Promise.all(abertas.splice(0).map((f) => f.encerrar()));
  await conectar().flushall();
});

afterAll(async () => {
  await Promise.all(conexoes.map((c) => c.quit().catch(() => undefined)));
  await conteiner.stop();
});

describe('runtime de filas (HU10) com Redis real', () => {
  it('a mesma chave não gera dois jobs nem duplica o efeito', async () => {
    const runtime = filas();
    let efeitos = 0;
    runtime.registrar(recalcular, () => {
      efeitos += 1;
      return Promise.resolve();
    });

    const ids = await Promise.all([
      runtime.publicar(recalcular, { prazoId: 'p1' }, { tenantId: TENANT }, 'p1:v1'),
      runtime.publicar(recalcular, { prazoId: 'p1' }, { tenantId: TENANT }, 'p1:v1'),
    ]);
    runtime.iniciar();
    await esperar(() => efeitos === 1);
    await new Promise((resolver) => setTimeout(resolver, 300));

    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toBe('prazos.recalcular-p1_v1');
    expect(efeitos).toBe(1);
  });

  it('roda no tenant do job, com a correlação de origem; job global roda sem tenant', async () => {
    const runtime = filas({ filasAtivas: ['prazos', 'manutencao'] });
    const vistos: unknown[] = [];
    runtime.registrar(recalcular, (_, contexto) => {
      vistos.push({
        tenant: tenantAtual(),
        requestId: obterContexto().requestId,
        tentativa: contexto.tentativa,
      });
      return Promise.resolve();
    });
    runtime.registrar(varrer, () => {
      vistos.push({ tenant: tenantAtual() });
      return Promise.resolve();
    });

    await executarComContexto({ requestId: 'req-origem' }, () =>
      runtime.publicar(recalcular, { prazoId: 'p2' }, { tenantId: TENANT }, 'p2'),
    );
    await runtime.publicar(varrer, {}, { global: true, motivo: 'limpeza diária' }, '2026-10-05');
    runtime.iniciar();
    await esperar(() => vistos.length === 2);

    expect(vistos).toEqual(
      expect.arrayContaining([
        { tenant: TENANT, requestId: 'req-origem', tentativa: 1 },
        { tenant: undefined },
      ]),
    );
  });

  it('esgotadas as tentativas (exponencial), o job vai para a DLQ e a métrica aponta', async () => {
    const runtime = filas();
    let tentativas = 0;
    runtime.registrar(recalcular, () => {
      tentativas += 1;
      return Promise.reject(new Error('serviço indisponível'));
    });

    await runtime.publicar(recalcular, { prazoId: 'p3' }, { tenantId: TENANT }, 'p3');
    runtime.iniciar();
    await esperar(async () => (await runtime.situacao())[0]?.dlq === 1, 30_000);

    expect(tentativas).toBe(5);
    const [situacao] = await runtime.situacao();
    expect(situacao).toMatchObject({ fila: 'prazos', aguardando: 0, dlq: 1 });
    const morto = await conectar().keys(`bull:${filaDlq('prazos')}:*`);
    expect(morto.length).toBeGreaterThan(0);
  }, 60_000);

  it('dados inválidos vão direto para a DLQ, sem retentativa', async () => {
    const runtime = filas();
    let chamadas = 0;
    runtime.registrar(recalcular, () => {
      chamadas += 1;
      return Promise.resolve();
    });
    // Publica pelo BullMQ direto, simulando um produtor com dados fora do schema.
    const { Queue } = await import('bullmq');
    const fila = new Queue('prazos', { connection: conectar() });
    await fila.add(
      'prazos.recalcular',
      {
        tipo: 'prazos.recalcular',
        escopo: { tenantId: TENANT },
        chave: 'x',
        contexto: {},
        dados: { prazoId: 42 },
      },
      { attempts: 5 },
    );
    await fila.add('desconhecido', { qualquer: 'coisa' }, { attempts: 5 });
    runtime.iniciar();

    await esperar(async () => (await runtime.situacao())[0]?.dlq === 2);
    expect(chamadas).toBe(0);
    await fila.close();
  });

  it('encerrar espera o job em andamento terminar (desligamento gracioso)', async () => {
    const runtime = filas();
    let estado = 'nao-iniciado';
    runtime.registrar(recalcular, async () => {
      estado = 'em-andamento';
      await new Promise((resolver) => setTimeout(resolver, 500));
      estado = 'concluido';
    });

    await runtime.publicar(recalcular, { prazoId: 'p4' }, { tenantId: TENANT }, 'p4');
    runtime.iniciar();
    await esperar(() => estado === 'em-andamento');
    await runtime.encerrar();
    abertas.splice(abertas.indexOf(runtime), 1);

    expect(estado).toBe('concluido');
  });

  it('job travado não prende o desligamento: passado o limite, fecha à força', async () => {
    const runtime = filas({ limiteEncerramentoMs: 500 });
    let iniciou = false;
    runtime.registrar(recalcular, () => {
      iniciou = true;
      return new Promise(() => undefined);
    });
    await runtime.publicar(recalcular, { prazoId: 'p6' }, { tenantId: TENANT }, 'p6');
    runtime.iniciar();
    await esperar(() => iniciou);

    const inicio = performance.now();
    await runtime.encerrar();
    abertas.splice(abertas.indexOf(runtime), 1);

    expect(performance.now() - inicio).toBeLessThan(3_000);
  });

  it('worker que morre no meio do job: outra instância retoma', async () => {
    const primeira = filas({ lockDurationMs: 1_000 });
    let execucoes = 0;
    let concluidoPor = '';
    primeira.registrar(recalcular, () => {
      execucoes += 1;
      return new Promise(() => undefined); // trava, como um processo que morreu
    });
    await primeira.publicar(recalcular, { prazoId: 'p5' }, { tenantId: TENANT }, 'p5');
    primeira.iniciar();
    await esperar(() => execucoes === 1);
    // "Mata" a primeira: a conexão some sem liberar o job, que fica travado até o lock expirar.
    conexoes.at(-1)?.disconnect();

    const segunda = filas({ lockDurationMs: 1_000 });
    segunda.registrar(recalcular, () => {
      concluidoPor = 'segunda';
      return Promise.resolve();
    });
    segunda.iniciar();

    await esperar(() => concluidoPor === 'segunda', 30_000);
    abertas.splice(abertas.indexOf(primeira), 1);
  }, 60_000);

  it('WORKER_QUEUES: a instância só consome as filas ativas', async () => {
    const soPrazos = filas({ filasAtivas: ['prazos'] });
    let varridos = 0;
    soPrazos.registrar(varrer, () => {
      varridos += 1;
      return Promise.resolve();
    });
    await soPrazos.publicar(varrer, {}, { global: true, motivo: 'teste' }, 'v1');
    soPrazos.iniciar();
    await new Promise((resolver) => setTimeout(resolver, 500));

    expect(soPrazos.filasAtivas()).toEqual(['prazos']);
    expect(varridos).toBe(0);
    expect(filas({ filasAtivas: [] }).filasAtivas()).toHaveLength(9);
  });
});
