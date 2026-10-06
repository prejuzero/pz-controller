import { FixedClock, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Banco, BancoSistema } from './banco.js';
import { executarNoTenant } from './tenant.js';
import { subirBancoDeTeste } from './teste/postgres.js';
import { WebhooksPostgres } from './webhooks.js';

import type { BancoDeTeste } from './teste/postgres.js';
import type { Uuid } from '@pz/kernel';

// Dados fictícios de teste.
const TENANT = '01a10e00-0000-7000-8000-0000000c0c01' as Uuid;
const relogio = new FixedClock(Instant.deIso('2026-10-06T12:00:00Z'));
const webhooks = new WebhooksPostgres();
const webhook = (idExterno: string) => ({
  adaptador: 'teste',
  idExterno,
  cabecalhos: { 'x-assinatura': 'abc' },
  corpo: new TextEncoder().encode('{"evento":"entregue"}'),
});

let teste: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;

beforeAll(async () => {
  teste = await subirBancoDeTeste();
  await teste.migrar();
  banco = new Banco({ url: teste.url('pz_app') });
  sistema = new BancoSistema({ url: teste.url('pz_sistema') });
  await sistema.executarComoSistema('preparar tenant de teste', (tx) =>
    tx.tenant.create({ data: { id: TENANT, nome: 'Escritório C', tipo: 'escritorio' } }),
  );
}, 300_000);

afterAll(async () => {
  await Promise.all([banco.encerrar(), sistema.encerrar()]);
  await teste.parar();
});

describe('webhooks de entrada (HU09)', () => {
  it('a api grava sem tenant; o repetido é ignorado; o sistema enfileira e processa uma vez', async () => {
    const gravar = (id: string) =>
      banco.executarSemTenant('webhook de entrada', (tx) => webhooks.gravar(tx, webhook(id)));
    expect(await gravar('ext-1')).toBe(true);
    expect(await gravar('ext-1')).toBe(false);

    const unidade = sistema.unidade('processar webhooks');
    const [id] = await unidade.executar((tx) => webhooks.reservarParaEnfileirar(tx, 10));
    expect(await unidade.executar((tx) => webhooks.reservarParaEnfileirar(tx, 10))).toEqual([]);

    const pendente = await unidade.executar((tx) => webhooks.pendente(tx, String(id)));
    expect(pendente).toMatchObject({ adaptador: 'teste', idExterno: 'ext-1' });
    expect(new TextDecoder().decode(pendente?.corpo)).toBe('{"evento":"entregue"}');
    await unidade.executar((tx) => webhooks.marcarProcessado(tx, String(id), relogio.agora()));
    expect(await unidade.executar((tx) => webhooks.pendente(tx, String(id)))).toBeUndefined();
  });

  it('sem tenant, pz_app não lê webhooks nem alcança dados de tenant (RLS continua valendo)', async () => {
    await executarNoTenant(TENANT, () =>
      banco.executar((tx) =>
        tx.usuario.create({
          data: {
            id: '01a10e00-0000-7000-8000-0000000c0c02',
            tenantId: TENANT,
            nome: 'Usuária C',
            email: 'c@exemplo.invalid',
          },
        }),
      ),
    );
    // Mesmo com tenant no contexto, a transação sem tenant zera o tenant.
    await executarNoTenant(TENANT, async () => {
      expect(await banco.executarSemTenant('teste de isolamento', (tx) => tx.usuario.count())).toBe(
        0,
      );
    });
    await expect(
      banco.executarSemTenant(
        'teste de isolamento',
        (tx) => tx.$queryRaw`SELECT corpo FROM webhook_recebido`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(banco.executarSemTenant('', () => Promise.resolve())).rejects.toThrow('motivo');
  });
});
