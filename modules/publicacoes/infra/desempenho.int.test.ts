import { Banco, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { gerarUuidV7 } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BuscarPublicacoes } from '../application/leitura.js';

import { LeituraPostgres } from './leitura-postgres.js';

import type { BancoDeTeste } from '@pz/db/teste';

/**
 * Desempenho da busca (HU28, PZ-186): p95 < 500 ms com 1 milhão de publicações. Massa sintética
 * FICTÍCIA gerada no banco. Leva minutos: roda com PZ_DESEMPENHO=1 (pnpm test:int:desempenho),
 * fora do CI comum; o k6 contra a API fica para staging.
 */
const ATIVO = process.env.PZ_DESEMPENHO === '1';
const TOTAL = 1_000_000;
const TENANT = gerarUuidV7();

let postgres: BancoDeTeste;
let banco: Banco;

describe.runIf(ATIVO)('desempenho da busca de publicações (1 milhão)', () => {
  beforeAll(async () => {
    postgres = await subirBancoDeTeste();
    await postgres.migrar();
    // Massa gravada pelo dono das tabelas (pz_migrator): a aplicação só lê pela view.
    const dono = await postgres.conectar('pz_migrator');
    // RLS forçado vale até para o dono: a sessão da carga fica no tenant da massa.
    await dono.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT]);
    await dono.query(
      `INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'Massa (fictício)', 'escritorio')`,
      [TENANT],
    );
    await dono.query(`
      INSERT INTO publicacao_conteudo (id, fonte, id_externo, hash_conteudo, data_disponibilizacao,
                                       teor, url_fonte, adaptador_versao)
      SELECT gen_random_uuid(), 'djen', 'massa-' || n, md5(n::text) || md5((n + 1)::text),
             DATE '2024-01-01' + (n % 900),
             'FICTÍCIO intimação ' || (ARRAY['sentença','despacho','acórdão','decisão','citação'])[1 + n % 5]
               || ' processo ' || n || ' parte Fulano' || (n % 5000),
             'https://exemplo.invalid/' || n, 'massa'
        FROM generate_series(1, ${String(TOTAL)}) n`);
    await dono.query(
      `INSERT INTO publicacao_destinatario (tenant_id, conteudo_id, conteudo_capturado_em, recebida_em)
       SELECT $1::uuid, id, capturado_em, capturado_em FROM publicacao_conteudo`,
      [TENANT],
    );
    await dono.query('ANALYZE publicacao_conteudo');
    await dono.query('ANALYZE publicacao_destinatario');
    await dono.end();
    banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 5 });
  }, 1_800_000);

  afterAll(async () => {
    await banco.encerrar();
    await postgres.parar();
  });

  it.each([
    ['texto raro', { textos: ['Fulano4321'] }],
    ['texto comum + período', { textos: ['sentenca'], de: '2025-01-01', ate: '2025-01-31' }],
    ['só período', { de: '2024-06-01', ate: '2024-06-07' }],
    ['sem filtro', {}],
  ])(
    '%s: p95 < 500 ms',
    async (_nome, filtro) => {
      const buscar = new BuscarPublicacoes(banco, new LeituraPostgres());
      const tempos: number[] = [];
      for (let i = 0; i < 20; i++) {
        const inicio = performance.now();
        await executarNoTenant(TENANT, () =>
          buscar.executar({ ordem: 'desc', limite: 20, ...filtro }),
        );
        tempos.push(performance.now() - inicio);
      }
      tempos.sort((a, b) => a - b);
      const p95 = tempos[Math.ceil(tempos.length * 0.95) - 1] ?? Infinity;
      expect(p95, `busca ${_nome}: p95 ${p95.toFixed(0)} ms`).toBeLessThan(500);
    },
    120_000,
  );
});
