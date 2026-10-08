import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Banco, BancoSistema } from './banco.js';
import { executarNoTenant } from './tenant.js';
import { subirBancoDeTeste } from './teste/postgres.js';

import type { Transacao } from './banco.js';
import type { BancoDeTeste } from './teste/postgres.js';
import type { Uuid } from '@pz/kernel';

// Modelo de publicações deduplicadas (HU18, ADR-014). Dados FICTÍCIOS.
const A = randomUUID() as Uuid;
const B = randomUUID() as Uuid;
const PROCESSO_A = randomUUID();
const PROCESSO_B = randomUUID();
const HASH = 'c'.repeat(64);

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
const noTenant = <T>(tenant: Uuid, trabalho: (tx: Transacao) => Promise<T>) =>
  executarNoTenant(tenant, () => banco.executar(trabalho));
const registrar = (tx: Transacao, hash = HASH) =>
  tx.$queryRaw<{ conteudo_id: string; capturado_em: Date; novo: boolean }[]>`
    SELECT * FROM pz_registrar_publicacao(${randomUUID()}::uuid, 'djen', '900000001', ${hash},
      '2026-10-06'::date, '10000040620268260100', 'FICTÍCIO: Intimação da parte autora para manifestação.',
      'https://exemplo.invalid/certidao', '{}'::jsonb, 'djen@1.0.0')`;

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar', async (tx) => {
    await tx.tenant.createMany({
      data: [
        { id: A, nome: 'A', tipo: 'escritorio' },
        { id: B, nome: 'B', tipo: 'escritorio' },
      ],
    });
    await tx.processo.createMany({
      data: [
        { id: PROCESSO_A, tenantId: A, numeroCnj: '10000040620268260100' },
        { id: PROCESSO_B, tenantId: B, numeroCnj: '10000040620268260100' },
      ],
    });
  });
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 10 });
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

describe('publicações deduplicadas (HU18, ADR-014)', () => {
  it('registro concorrente do mesmo conteúdo grava uma vez só', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 8 }, () => noTenant(A, async (tx) => (await registrar(tx))[0])),
    );
    expect(new Set(resultados.map((r) => r?.conteudo_id)).size).toBe(1);
    expect(resultados.filter((r) => r?.novo)).toHaveLength(1);
    const total = await sistema.executarComoSistema('conferir', (tx) =>
      tx.publicacaoConteudo.count(),
    );
    expect(total).toBe(1);
  });

  it('cada tenant só lê pela view o conteúdo que recebeu; busca sem acento', async () => {
    const [conteudo] = await noTenant(A, (tx) => registrar(tx));
    if (conteudo === undefined) throw new Error('sem conteúdo');
    await noTenant(A, (tx) =>
      tx.publicacaoDestinatario.create({
        data: {
          tenantId: A,
          conteudoId: conteudo.conteudo_id,
          conteudoCapturadoEm: conteudo.capturado_em,
          processoId: PROCESSO_A,
        },
      }),
    );
    const daView = (tenant: Uuid) =>
      noTenant(
        tenant,
        (tx) =>
          tx.$queryRaw<{ teor: string }[]>`
          SELECT teor FROM publicacao_do_tenant
           WHERE teor_tsv @@ plainto_tsquery('portugues_sem_acento', 'intimacao manifestacao')`,
      );
    expect((await daView(A)).map((l) => l.teor)).toEqual([
      'FICTÍCIO: Intimação da parte autora para manifestação.',
    ]);
    expect(await daView(B)).toEqual([]);
  });

  it('a aplicação não lê o conteúdo direto; ninguém altera; processo de outro tenant é recusado', async () => {
    await expect(
      noTenant(A, (tx) => tx.$queryRaw`SELECT teor FROM publicacao_conteudo`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      sistema.executarComoSistema(
        'tentar alterar',
        (tx) => tx.$executeRaw`UPDATE publicacao_conteudo SET teor = 'x'`,
      ),
    ).rejects.toThrow(/imutável|permission denied/);
    const [outro] = await noTenant(A, (tx) => registrar(tx, 'd'.repeat(64)));
    if (outro === undefined) throw new Error('sem conteúdo');
    await expect(
      noTenant(A, (tx) =>
        tx.publicacaoDestinatario.create({
          data: {
            tenantId: A,
            conteudoId: outro.conteudo_id,
            conteudoCapturadoEm: outro.capturado_em,
            processoId: PROCESSO_B,
          },
        }),
      ),
    ).rejects.toThrow(/Foreign key|foreign key/);
  });
});
