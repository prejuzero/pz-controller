import { Banco, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { gerarUuidV7 } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConsultarHistorico } from '../application/historico.js';

import { HistoricoPostgres } from './historico-postgres.js';

import type { BancoDeTeste } from '@pz/db/teste';

/**
 * Desempenho do histórico do prazo (HU35, PZ-211): p95 < 300 ms com 500 eventos do prazo, no
 * meio de uma trilha grande do escritório. Massa sintética FICTÍCIA gravada direto no banco (a
 * cadeia de hashes não importa para a leitura). Leva minutos: roda com PZ_DESEMPENHO=1
 * (pnpm test:int:desempenho), fora do CI comum.
 */
const ATIVO = process.env.PZ_DESEMPENHO === '1';
const OUTROS_EVENTOS = 300_000;
const EVENTOS_DO_PRAZO = 500;
const NOTIFICACOES = 20;
const TENANT = gerarUuidV7();
const PRAZO = gerarUuidV7();
const notificacoes = Array.from({ length: NOTIFICACOES }, () => gerarUuidV7());

let postgres: BancoDeTeste;
let banco: Banco;

describe.runIf(ATIVO)('desempenho do histórico do prazo (500 eventos)', () => {
  beforeAll(async () => {
    postgres = await subirBancoDeTeste();
    await postgres.migrar();
    const dono = await postgres.conectar('pz_migrator');
    await dono.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT]);
    await dono.query(
      `INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'Massa (fictício)', 'escritorio')`,
      [TENANT],
    );
    // Trilha do escritório: muitos eventos de outros prazos e processos; os do prazo medido e
    // das notificações dele (5 cada) espalhados no meio.
    await dono.query(
      `INSERT INTO evento_auditoria (id, tenant_id, sequencia, tipo, entidade, entidade_id, canal,
                                     depois, criado_em, hash_anterior, hash)
       SELECT gen_random_uuid(), $1::uuid, n, 'prazos.prazo-ajustado',
              CASE WHEN n % ${String(OUTROS_EVENTOS / EVENTOS_DO_PRAZO)} = 0 THEN 'prazo'
                   WHEN n % 3 = 0 THEN 'processo' ELSE 'prazo' END,
              CASE WHEN n % ${String(OUTROS_EVENTOS / EVENTOS_DO_PRAZO)} = 0 THEN $2
                   ELSE 'outro-' || (n % 20000) END,
              'portal', jsonb_build_object('n', n),
              timestamptz '2026-01-01' + n * interval '1 second',
              md5(n::text) || md5((n + 1)::text), md5((n + 2)::text) || md5((n + 3)::text)
         FROM generate_series(1, ${String(OUTROS_EVENTOS)}) n`,
      [TENANT, PRAZO],
    );
    await dono.query(
      `INSERT INTO evento_auditoria (id, tenant_id, sequencia, tipo, entidade, entidade_id, canal,
                                     criado_em, hash_anterior, hash)
       SELECT gen_random_uuid(), $1::uuid, ${String(OUTROS_EVENTOS)} + n,
              'notificacoes.notificacao-rejeitada', 'notificacao', ($2::text[])[1 + n % $3],
              'sistema', timestamptz '2026-06-01' + n * interval '1 second',
              md5(n::text) || md5(n::text), md5((n + 9)::text) || md5(n::text)
         FROM generate_series(1, $3 * 5) n`,
      [TENANT, notificacoes, NOTIFICACOES],
    );
    await dono.query('ANALYZE evento_auditoria');
    await dono.end();
    banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 5 });
  }, 1_800_000);

  afterAll(async () => {
    await banco.encerrar();
    await postgres.parar();
  });

  it('p95 < 300 ms; traz todos os eventos do prazo e das notificações', async () => {
    const consultar = new ConsultarHistorico(banco, new HistoricoPostgres());
    const alvos = [
      { entidade: 'prazo', entidadeId: PRAZO },
      ...notificacoes.map((id) => ({ entidade: 'notificacao', entidadeId: id })),
    ];
    const tempos: number[] = [];
    let total = 0;
    for (let i = 0; i < 30; i++) {
      const inicio = performance.now();
      const eventos = await executarNoTenant(TENANT, () => consultar.executar(TENANT, alvos));
      tempos.push(performance.now() - inicio);
      total = eventos.length;
    }
    expect(total).toBe(EVENTOS_DO_PRAZO + NOTIFICACOES * 5);
    tempos.sort((a, b) => a - b);
    const p95 = tempos[Math.ceil(tempos.length * 0.95) - 1] ?? Infinity;
    // Registra o valor medido (a meta pede o número, não só passa/falha).
    process.stdout.write(
      `histórico do prazo: p95 ${p95.toFixed(0)} ms (${String(total)} eventos)\n`,
    );
    expect(p95, `p95 ${p95.toFixed(0)} ms`).toBeLessThan(300);
  }, 120_000);
});
