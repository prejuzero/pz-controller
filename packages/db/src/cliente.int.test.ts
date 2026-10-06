import {
  FixedClock,
  gerarUuidV7,
  Instant,
  limparOutbox,
  processarUmaVez,
  publicarPendentes,
} from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Banco, BancoSistema } from './banco.js';
import { OutboxPostgres } from './outbox.js';
import { executarNoTenant, SemTenant } from './tenant.js';
import { subirBancoDeTeste } from './teste/postgres.js';

import type { Transacao } from './banco.js';
import type { BancoDeTeste } from './teste/postgres.js';
import type { EventoDominio, Uuid } from '@pz/kernel';

// Dados fictícios de teste.
const TENANT_A = '01a10e00-0000-7000-8000-00000000aa01' as Uuid;
const TENANT_B = '01a10e00-0000-7000-8000-00000000bb01' as Uuid;
const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));

let teste: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
const outbox = new OutboxPostgres();

beforeAll(async () => {
  teste = await subirBancoDeTeste();
  await teste.migrar();
  banco = new Banco({ url: teste.url('pz_app') });
  sistema = new BancoSistema({ url: teste.url('pz_sistema') });
  await sistema.executarComoSistema('preparar tenants de teste', (tx) =>
    tx.tenant.createMany({
      data: [
        { id: TENANT_A, nome: 'Escritório A', tipo: 'escritorio' },
        { id: TENANT_B, nome: 'Autônomo B', tipo: 'autonomo' },
      ],
    }),
  );
}, 300_000);

afterAll(async () => {
  await Promise.all([banco.encerrar(), sistema.encerrar()]);
  await teste.parar();
});

function evento(tenantId: Uuid, tipo = 'PrazoConfirmado'): EventoDominio {
  return {
    id: gerarUuidV7(),
    tipo,
    versao: 1,
    tenantId,
    agregadoId: gerarUuidV7(),
    ocorridoEm: relogio.agora(),
    payload: { exemplo: true },
  };
}

async function esvaziarOutbox(): Promise<void> {
  await sistema.executarComoSistema('limpar outbox entre testes', async (tx) => {
    await tx.eventoProcessado.deleteMany();
    await tx.eventoDominio.deleteMany();
  });
}

describe('Banco (pz_app) com contexto de tenant', () => {
  it('sem tenant no contexto, recusa explicitamente', async () => {
    await expect(banco.executar((tx) => tx.usuario.findMany())).rejects.toBeInstanceOf(SemTenant);
  });

  it('cada tenant só lê e escreve o que é seu', async () => {
    const id = gerarUuidV7();
    await executarNoTenant(TENANT_A, () =>
      banco.executar((tx) =>
        tx.usuario.create({ data: { id, tenantId: TENANT_A, nome: 'Ana', email: 'ana@a.teste' } }),
      ),
    );

    const vistosPorA = await executarNoTenant(TENANT_A, () =>
      banco.executar((tx) => tx.usuario.findMany()),
    );
    const vistosPorB = await executarNoTenant(TENANT_B, () =>
      banco.executar((tx) => tx.usuario.findMany()),
    );
    expect(vistosPorA.map((u) => u.id)).toEqual([id]);
    expect(vistosPorB).toEqual([]);

    await expect(
      executarNoTenant(TENANT_A, () =>
        banco.executar((tx) =>
          tx.usuario.create({
            data: { id: gerarUuidV7(), tenantId: TENANT_B, nome: 'X', email: 'x@b.teste' },
          }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('o contexto vale por transação: tenants concorrentes não se misturam', async () => {
    const contar = (tenant: Uuid) =>
      executarNoTenant(tenant, () =>
        banco.executar((tx) => tx.tenant.findMany({ select: { id: true } })),
      );
    const resultados = await Promise.all(
      Array.from({ length: 20 }, (_, i) => contar(i % 2 === 0 ? TENANT_A : TENANT_B)),
    );
    resultados.forEach((tenants, i) => {
      expect(tenants.map((t) => t.id)).toEqual([i % 2 === 0 ? TENANT_A : TENANT_B]);
    });
  });

  it('confere a conexão no protocolo do PostgreSQL', async () => {
    await expect(banco.verificar()).resolves.toBeUndefined();
    const errado = new Banco({ url: teste.url('pz_app').replace('pz_app_local', 'senha-errada') });
    await expect(errado.verificar()).rejects.toThrow();
    await errado.encerrar();
  });
});

describe('BancoSistema (pz_sistema)', () => {
  it('exige motivo e enxerga todos os tenants', async () => {
    await expect(sistema.executarComoSistema('  ', (tx) => tx.tenant.findMany())).rejects.toThrow(
      'motivo',
    );
    const tenants = await sistema.executarComoSistema('teste de acesso global', (tx) =>
      tx.tenant.findMany(),
    );
    expect(tenants.map((t) => t.id).sort()).toEqual([TENANT_A, TENANT_B]);
  });
});

describe('OutboxPostgres (ADR-004) com PostgreSQL real', () => {
  const relay = () => sistema.unidade('relay do outbox (teste)');

  it('transação revertida não grava evento; confirmada grava com o contexto', async () => {
    await esvaziarOutbox();
    await expect(
      executarNoTenant(TENANT_A, () =>
        banco.executar(async (tx) => {
          await outbox.gravar(tx, [evento(TENANT_A)]);
          throw new Error('falha depois de gravar');
        }),
      ),
    ).rejects.toThrow('falha depois de gravar');
    await executarNoTenant(TENANT_A, () =>
      banco.executar((tx) => outbox.gravar(tx, [evento(TENANT_A), evento(TENANT_A)])),
    );
    await executarNoTenant(TENANT_A, () => banco.executar((tx) => outbox.gravar(tx, [])));

    const pendentes = await relay().executar((tx) => tx.eventoDominio.findMany());
    expect(pendentes).toHaveLength(2);
    expect(pendentes[0]?.contexto).toEqual({});
    const reservados = await relay().executar((tx) => outbox.reservarPendentesComContexto(tx, 10));
    expect(reservados.map((r) => r.contexto)).toEqual([{}, {}]);
    expect(reservados[0]?.evento.ocorridoEm.paraIso()).toBe('2026-10-05T12:00:00.000Z');
  });

  it('dois relays concorrentes não publicam o mesmo evento duas vezes (SKIP LOCKED)', async () => {
    await esvaziarOutbox();
    const eventos = Array.from({ length: 20 }, (_, i) => evento(i % 2 === 0 ? TENANT_A : TENANT_B));
    for (const tenant of [TENANT_A, TENANT_B]) {
      await executarNoTenant(tenant, () =>
        banco.executar((tx) =>
          outbox.gravar(
            tx,
            eventos.filter((e) => e.tenantId === tenant),
          ),
        ),
      );
    }
    const publicados: string[] = [];
    const publicar = async (item: EventoDominio) => {
      await new Promise((resolver) => setTimeout(resolver, 5));
      publicados.push(item.id);
    };

    const [primeiro, segundo] = await Promise.all([
      publicarPendentes(relay(), outbox, publicar, relogio, 15),
      publicarPendentes(relay(), outbox, publicar, relogio, 15),
    ]);

    expect(primeiro + segundo).toBe(20);
    expect(new Set(publicados).size).toBe(20);
    expect(publicados).toHaveLength(20);
    expect(
      await relay().executar((tx) => tx.eventoDominio.count({ where: { publicadoEm: null } })),
    ).toBe(0);
  });

  it('relay que cai entre publicar e marcar republica, e o consumidor processa uma vez só', async () => {
    await esvaziarOutbox();
    const confirmado = evento(TENANT_A);
    await executarNoTenant(TENANT_A, () => banco.executar((tx) => outbox.gravar(tx, [confirmado])));
    let efeitos = 0;
    const consumir = (item: EventoDominio) =>
      executarNoTenant(item.tenantId, () =>
        processarUmaVez(banco, outbox, 'notificacoes', item, async (tx: Transacao) => {
          await tx.usuario.count();
          efeitos += 1;
        }),
      );
    const filaQueCai = {
      reservarPendentes: (tx: Transacao, limite: number) => outbox.reservarPendentes(tx, limite),
      marcarPublicados: () => Promise.reject(new Error('relay caiu antes de marcar')),
    };

    await expect(
      publicarPendentes(
        relay(),
        filaQueCai,
        async (item) => {
          await consumir(item);
        },
        relogio,
        10,
      ),
    ).rejects.toThrow('relay caiu');
    const resultados: string[] = [];
    await publicarPendentes(
      relay(),
      outbox,
      async (item) => {
        resultados.push(await consumir(item));
      },
      relogio,
      10,
    );

    expect(resultados).toEqual(['ignorado']);
    expect(efeitos).toBe(1);
  });

  it('o mesmo consumidor processando o mesmo evento em paralelo: um processa, o outro ignora', async () => {
    await esvaziarOutbox();
    const confirmado = evento(TENANT_B);
    let efeitos = 0;
    const consumir = () =>
      executarNoTenant(TENANT_B, () =>
        processarUmaVez(banco, outbox, 'auditoria', confirmado, async () => {
          await new Promise((resolver) => setTimeout(resolver, 50));
          efeitos += 1;
        }),
      );

    const resultados = await Promise.all([consumir(), consumir()]);

    expect(resultados.sort()).toEqual(['ignorado', 'processado']);
    expect(efeitos).toBe(1);
  });

  it('a deduplicação de um tenant não aparece para outro', async () => {
    const processadosVistosPorA = await executarNoTenant(TENANT_A, () =>
      banco.executar((tx) => tx.eventoProcessado.findMany()),
    );
    expect(processadosVistosPorA.every((p) => p.tenantId === TENANT_A)).toBe(true);
  });
});

describe('limpeza do outbox (HU10) com PostgreSQL real', () => {
  const DIA_MS = 24 * 3600 * 1000;
  const diasAtras = (dias: number) => new Date(relogio.agora().maisMs(-dias * DIA_MS).epochMs);

  it('remove publicados e deduplicação além de 30 dias, de todos os tenants; pendentes ficam', async () => {
    await esvaziarOutbox();
    const [antigoA, antigoB, recente, pendenteAntigo] = [
      evento(TENANT_A),
      evento(TENANT_B),
      evento(TENANT_A),
      evento(TENANT_B),
    ];
    for (const item of [antigoA, antigoB, recente, pendenteAntigo]) {
      await executarNoTenant(item.tenantId, () =>
        banco.executar(async (tx) => {
          await outbox.gravar(tx, [item]);
          await outbox.registrarSeNovo(tx, 'consumidor-teste', item.id);
        }),
      );
    }
    await sistema.executarComoSistema('envelhecer o outbox no teste', async (tx) => {
      await tx.eventoDominio.updateMany({
        where: { id: { in: [antigoA.id, antigoB.id] } },
        data: { publicadoEm: diasAtras(31), criadoEm: diasAtras(31) },
      });
      await tx.eventoDominio.update({
        where: { id: recente.id },
        data: { publicadoEm: diasAtras(29) },
      });
      await tx.eventoDominio.update({
        where: { id: pendenteAntigo.id },
        data: { criadoEm: diasAtras(90) },
      });
      await tx.eventoProcessado.updateMany({
        where: { eventoId: { in: [antigoA.id, antigoB.id] } },
        data: { processadoEm: diasAtras(31) },
      });
    });

    // Lote de 1: atravessa os dois tenants em várias transações curtas.
    const resultado = await limparOutbox(sistema.unidade('limpeza do outbox'), outbox, relogio, {
      retencaoMs: 30 * DIA_MS,
      lote: 1,
    });

    expect(resultado).toEqual({ eventos: 2, processados: 2 });
    const restantes = await sistema.executarComoSistema('conferir a limpeza', async (tx) => ({
      eventos: (await tx.eventoDominio.findMany({ select: { id: true } })).map((e) => e.id).sort(),
      processados: (await tx.eventoProcessado.findMany({ select: { eventoId: true } }))
        .map((p) => p.eventoId)
        .sort(),
    }));
    expect(restantes).toEqual({
      eventos: [recente.id, pendenteAntigo.id].sort(),
      processados: [recente.id, pendenteAntigo.id].sort(),
    });
  });
});
