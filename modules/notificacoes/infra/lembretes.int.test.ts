import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, gerarUuidV7, Instant, LocalDate } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DispararLembretes, ProgramarLembretes } from '../application/lembretes.js';
import { Notificar } from '../application/notificacoes.js';

import { ConsentimentosPostgres } from './consentimentos-postgres.js';
import { LembretesPostgres } from './lembretes-postgres.js';
import {
  NotificacoesPostgres,
  PreferenciasPostgres,
  SupressaoPostgres,
} from './notificacoes-postgres.js';

import type { AgendaDoPrazo } from '../application/lembretes.js';
import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

/**
 * QA da HU31 (PZ-199) com Postgres real: três réplicas disparando ao mesmo tempo não duplicam
 * (SKIP LOCKED no lote e chave de idempotência da notificação). Dados FICTÍCIOS.
 */
const TENANT = gerarUuidV7();
const OUTRO = gerarUuidV7();
const ANA = gerarUuidV7();
const relogio = new FixedClock(Instant.deIso('2026-11-01T12:00:00.000Z'));
const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
const prazos = Array.from({ length: 20 }, () => gerarUuidV7());
const primeiro = gerarUuidV7();
prazos.unshift(primeiro);

const agenda: AgendaDoPrazo = {
  situacao: (prazoId) =>
    Promise.resolve({
      prazoId,
      processoId: prazoId,
      responsavelId: ANA,
      statusCiencia: 'pendente',
      vencimento: d('2026-11-13'),
      lembrar: true,
    }),
  datas: () =>
    Promise.resolve([
      { antecedencia: 2, data: d('2026-11-10') },
      { antecedencia: 1, data: d('2026-11-11') },
      { antecedencia: 0, data: d('2026-11-13') },
    ]),
};

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar escritórios', (tx) =>
    tx.tenant.createMany({
      data: [
        { id: TENANT, nome: 'Escritório (fictício)', tipo: 'escritorio' },
        { id: OUTRO, nome: 'Outro (fictício)', tipo: 'escritorio' },
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

const notificar = () =>
  new Notificar<Transacao>(
    new NotificacoesPostgres(),
    new PreferenciasPostgres(),
    { emails: () => Promise.resolve({ principal: 'ana@exemplo.invalid', copias: [] }) },
    new SupressaoPostgres(),
    new ConsentimentosPostgres(),
    new OutboxPostgres(),
    relogio,
  );
const replica = () =>
  new DispararLembretes<Transacao>(
    sistema.unidade('teste: tenants com lembretes devidos'),
    (tenantId, trabalho) => executarNoTenant(tenantId, trabalho),
    banco,
    new LembretesPostgres(),
    agenda,
    () => Promise.resolve('0000001-09.2030.8.09.0001'),
    notificar(),
    'https://app.exemplo.invalid',
    relogio,
  );

describe('lembretes no PostgreSQL (HU31)', () => {
  it('programa, isola por tenant e três réplicas simultâneas não duplicam', async () => {
    const programar = new ProgramarLembretes<Transacao>(
      new LembretesPostgres(),
      new PreferenciasPostgres(),
      agenda,
      relogio,
    );
    for (const prazoId of prazos) {
      await executarNoTenant(TENANT, () =>
        banco.executar((tx) => programar.executar(tx, TENANT, prazoId)),
      );
    }
    // Reprogramar não duplica: cancela e regrava.
    await executarNoTenant(TENANT, () =>
      banco.executar((tx) => programar.executar(tx, TENANT, primeiro)),
    );
    const contar = (tenant: Uuid) =>
      executarNoTenant(tenant, () =>
        banco.executar((tx) => tx.lembreteAgendado.count({ where: { situacao: 'agendado' } })),
      );
    // 3 antecedências + 2 insistências por prazo.
    expect(await contar(TENANT)).toBe(prazos.length * 5);
    expect(await contar(OUTRO)).toBe(0);

    relogio.definir(Instant.deIso('2026-11-11T18:00:00.000Z'));
    const resultados = await Promise.all([
      replica().executar(),
      replica().executar(),
      replica().executar(),
    ]);
    const enviados = resultados.reduce((total, r) => total + r.enviado, 0);
    // Devidos: antecedência 2 e 1 e a insistência do dia 11 = 3 por prazo.
    expect(enviados).toBe(prazos.length * 3);
    const notificacoes = await executarNoTenant(TENANT, () =>
      banco.executar((tx) => tx.notificacao.count({ where: { tipo: 'lembrete-prazo' } })),
    );
    expect(notificacoes).toBe(prazos.length * 3);
    expect(await replica().executar()).toEqual({ enviado: 0, cancelado: 0, dispensado: 0 });
  }, 120_000);
});
