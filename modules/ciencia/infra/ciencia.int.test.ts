import { randomBytes } from 'node:crypto';

import { TrilhaPostgres } from '@pz/auditoria';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConfirmarCiencia, EmitirLinkDeCiencia } from '../application/ciencia.js';

import { CienciaPostgres } from './ciencia-postgres.js';
import { TokensHmac } from './tokens.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

/** QA da HU33 (PZ-206) com Postgres real: só o hash, RLS e uso único sob concorrência. FICTÍCIO. */
const A = gerarUuidV7();
const B = gerarUuidV7();
const ANA = gerarUuidV7();
const PRAZO = gerarUuidV7();
const relogio = new FixedClock(Instant.deIso('2026-11-03T12:00:00.000Z'));
const tokens = new TokensHmac(randomBytes(32));
const contexto = { ip: '203.0.113.7', userAgent: 'Navegador Fictício/1.0' };

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar escritórios', (tx) =>
    tx.tenant.createMany({
      data: [
        { id: A, nome: 'A (fictício)', tipo: 'escritorio' },
        { id: B, nome: 'B (fictício)', tipo: 'escritorio' },
      ],
    }),
  );
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 10 });
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

const noTenant = <T>(tenantId: Uuid, f: () => Promise<T>) => executarNoTenant(tenantId, f);
describe('ciência no PostgreSQL (HU33)', () => {
  it('guarda só o hash; dez POSTs simultâneos confirmam uma vez; outro tenant não vê', async () => {
    const link = await noTenant(A, () =>
      banco.executar((tx) =>
        new EmitirLinkDeCiencia<Transacao>(
          new CienciaPostgres(),
          tokens,
          'https://app.exemplo.invalid',
          relogio,
        ).executar(tx, { tenantId: A, prazoId: PRAZO, usuarioId: ANA }),
      ),
    );
    const token = link.split('/ciencia/')[1] ?? '';
    const gravado = await noTenant(A, () =>
      banco.executar((tx) => tx.tokenCiencia.findFirstOrThrow({ where: { prazoId: PRAZO } })),
    );
    expect(gravado.hashToken).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(gravado)).not.toContain(token.split('.')[1] ?? '###');
    expect(await noTenant(B, () => banco.executar((tx) => tx.tokenCiencia.count()))).toBe(0);

    // O serviço usa o banco da aplicação, sob RLS: a confirmação roda no tenant do token.
    const servico = new ConfirmarCiencia<Transacao>(
      noTenant,
      banco,
      new CienciaPostgres(),
      tokens,
      (prazoId) =>
        Promise.resolve({
          prazoId,
          numeroProcesso: 'x',
          tipoAto: 'contestacao',
          vencimento: '2026-11-13',
          status: 'pendente',
        }),
      new TrilhaPostgres(),
      new OutboxPostgres(),
      relogio,
    );
    const resultados = await Promise.all(
      Array.from({ length: 10 }, () => servico.peloLink(token, contexto)),
    );
    expect(resultados.filter((r) => r.ok && !r.valor.jaConfirmada)).toHaveLength(1);
    const auditoria = await noTenant(A, () =>
      banco.executar((tx) =>
        tx.eventoAuditoria.count({ where: { tipo: 'ciencia.ciencia-confirmada' } }),
      ),
    );
    expect(auditoria).toBe(1);
    const eventos = await noTenant(A, () =>
      banco.executar((tx) => tx.eventoDominio.count({ where: { tipo: 'CienciaConfirmada' } })),
    );
    expect(eventos).toBe(1);
    // Controle de ciência (HU34): a confirmação bate com a trilha; outro tenant não vê.
    const confirmacoes = await noTenant(A, () =>
      banco.executar((tx) => new CienciaPostgres().confirmacoes(tx, [PRAZO, B])),
    );
    expect([...confirmacoes.keys()]).toEqual([PRAZO]);
    expect(confirmacoes.get(PRAZO)?.canal).toBe('email');
    expect(
      (
        await noTenant(B, () =>
          banco.executar((tx) => new CienciaPostgres().confirmacoes(tx, [PRAZO])),
        )
      ).size,
    ).toBe(0);
    expect(
      (await noTenant(A, () => banco.executar((tx) => new CienciaPostgres().confirmacoes(tx, []))))
        .size,
    ).toBe(0);
  }, 120_000);
});
