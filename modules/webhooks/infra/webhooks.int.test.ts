import { Banco, BancoSistema, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AssinaturasDeWebhookPostgres, EntregasDeWebhookPostgres } from './webhooks-postgres.js';

import type { Assinatura, Entrega } from '../application/portas.js';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS.
const TENANT_A = '01a10e00-0000-7000-8000-0000000e0a01' as Uuid;
const TENANT_B = '01a10e00-0000-7000-8000-0000000e0b01' as Uuid;
const relogio = new FixedClock(Instant.deIso('2026-11-06T12:00:00Z'));
let postgres: BancoDeTeste;
let banco: Banco;

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  const sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar tenants de teste', (tx) =>
    tx.tenant.createMany({
      data: [
        { id: TENANT_A, nome: 'Escritório A', tipo: 'escritorio' },
        { id: TENANT_B, nome: 'Escritório B', tipo: 'escritorio' },
      ],
    }),
  );
  await sistema.encerrar();
  banco = new Banco({ url: postgres.url('pz_app') });
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await postgres.parar();
});

const assinatura = (tenantId: Uuid, eventos: Assinatura['eventos']): Assinatura => ({
  id: gerarUuidV7(),
  tenantId,
  url: 'https://erp.exemplo.invalid/webhooks',
  descricao: 'ERP fictício',
  eventos,
  segredoCifrado: 'cifrado-ficticio',
  criadoPor: gerarUuidV7(),
  criadoEm: relogio.agora(),
  desativadaEm: null,
});

const entrega = (a: Assinatura, eventoId: Uuid): Entrega => ({
  id: gerarUuidV7(),
  tenantId: a.tenantId,
  assinaturaId: a.id,
  eventoId,
  tipo: 'prazo.confirmado',
  ocorridoEm: relogio.agora(),
  dados: { prazoId: 'p', processoId: null },
  situacao: 'pendente',
  tentativas: 0,
  ultimoStatus: null,
  ultimoErro: null,
  entregueEm: null,
  criadoEm: relogio.agora(),
});

describe('webhooks de saída no PostgreSQL (HU49)', () => {
  it('assinaturas por tenant (RLS), filtro por evento e desativação', async () => {
    const repo = new AssinaturasDeWebhookPostgres();
    const a = assinatura(TENANT_A, ['prazo.confirmado', 'prazo.vencido']);
    const outra = assinatura(TENANT_A, ['publicacao.recebida']);
    await executarNoTenant(TENANT_A, () =>
      banco.executar(async (tx) => {
        await repo.inserir(tx, a);
        await repo.inserir(tx, outra);
      }),
    );
    const noA = <T>(f: Parameters<typeof banco.executar<T>>[0]) =>
      executarNoTenant(TENANT_A, () => banco.executar(f));
    expect((await noA((tx) => repo.ativasDoEvento(tx, 'prazo.vencido'))).map((x) => x.id)).toEqual([
      a.id,
    ]);
    expect(await executarNoTenant(TENANT_B, () => banco.executar((tx) => repo.listar(tx)))).toEqual(
      [],
    );
    expect(
      await executarNoTenant(TENANT_B, () => banco.executar((tx) => repo.buscar(tx, a.id))),
    ).toBeUndefined();
    expect(await noA((tx) => repo.desativar(tx, a.id, relogio.agora()))).toBe(true);
    expect(await noA((tx) => repo.desativar(tx, a.id, relogio.agora()))).toBe(false);
    expect(await noA((tx) => repo.ativasDoEvento(tx, 'prazo.vencido'))).toEqual([]);
    expect((await noA((tx) => repo.listar(tx))).length).toBe(2);
  });

  it('entrega única por evento, tentativas, reabertura e isolamento', async () => {
    const assinaturas = new AssinaturasDeWebhookPostgres();
    const repo = new EntregasDeWebhookPostgres();
    const a = assinatura(TENANT_A, ['prazo.confirmado']);
    const eventoId = gerarUuidV7();
    const e = entrega(a, eventoId);
    const noA = <T>(f: Parameters<typeof banco.executar<T>>[0]) =>
      executarNoTenant(TENANT_A, () => banco.executar(f));
    await noA((tx) => assinaturas.inserir(tx, a));
    expect(await noA((tx) => repo.inserirSeNova(tx, e))).toBe(true);
    expect(await noA((tx) => repo.inserirSeNova(tx, { ...e, id: gerarUuidV7() }))).toBe(false);

    await noA((tx) =>
      repo.registrarTentativa(tx, e.id, {
        situacao: 'falhou',
        status: 503,
        erro: 'HTTP 503',
        agora: relogio.agora(),
        enviou: true,
      }),
    );
    expect(await noA((tx) => repo.reabrir(tx, e.id))).toBe(true);
    expect(await noA((tx) => repo.reabrir(tx, e.id))).toBe(false);
    await noA((tx) =>
      repo.registrarTentativa(tx, e.id, {
        situacao: 'entregue',
        status: 200,
        erro: null,
        agora: relogio.agora(),
        enviou: true,
      }),
    );
    expect(await noA((tx) => repo.buscar(tx, e.id))).toMatchObject({
      situacao: 'entregue',
      tentativas: 2,
      ultimoStatus: 200,
      entregueEm: relogio.agora(),
      dados: { prazoId: 'p', processoId: null },
    });
    expect(
      (await noA((tx) => repo.listar(tx, { assinaturaId: a.id, limite: 10 }))).map((x) => x.id),
    ).toEqual([e.id]);
    expect(
      await executarNoTenant(TENANT_B, () =>
        banco.executar((tx) => repo.listar(tx, { limite: 10 })),
      ),
    ).toEqual([]);
  });
});
