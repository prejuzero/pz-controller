import { ExportResultCode } from '@opentelemetry/core';
import { iniciarTelemetria } from '@pz/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BancoDeTeste } from './teste/postgres.js';
import type { OpcoesTelemetria, Telemetria } from '@pz/observability';

type Exportador = NonNullable<OpcoesTelemetria['exportadorDeSpans']>;
type Span = Parameters<Exportador['export']>[0][number];

const spans: Span[] = [];
const exportador: Exportador = {
  export(lote, concluir) {
    spans.push(...lote);
    concluir({ code: ExportResultCode.SUCCESS });
  },
  shutdown: () => Promise.resolve(),
};

let telemetria: Telemetria;
let banco: BancoDeTeste;

beforeAll(async () => {
  // A instrumentação só alcança o pg carregado depois dela, como no boot da api e do worker.
  telemetria = iniciarTelemetria({
    servico: 'pz-teste',
    versao: 'teste',
    ambiente: 'test',
    exportadorDeSpans: exportador,
  });
  const { subirBancoDeTeste } = await import('./teste/postgres.js');
  banco = await subirBancoDeTeste();
}, 300_000);

afterAll(async () => {
  await banco.parar();
  await telemetria.encerrar();
});

describe('SQL nos traces (HU06, herdado da HU05)', () => {
  it('cada consulta vira span com o SQL parametrizado, sem os valores', async () => {
    const { default: pg } = await import('pg');
    const cliente = new pg.Client({ connectionString: banco.url('pz_app') });
    await cliente.connect();
    try {
      await cliente.query('SELECT $1::text AS segredo', ['valor-que-nao-pode-vazar']);
    } finally {
      await cliente.end();
    }

    const consulta = spans.find((s) =>
      String(s.attributes['db.statement'] ?? s.attributes['db.query.text']).includes('$1::text'),
    );
    expect(consulta).toBeDefined();
    expect(JSON.stringify(spans.map((s) => s.attributes))).not.toContain(
      'valor-que-nao-pode-vazar',
    );
  });
});
