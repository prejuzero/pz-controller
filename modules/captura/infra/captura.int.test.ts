import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, gerarUuidV7, Instant, LocalDate } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ExecutarCaptura, ManterAssinaturas, PlanejarCaptura } from '../application/captura.js';

import { AssinaturasPostgres, CapturaPostgres } from './captura-postgres.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { FontePublicacoes } from '@pz/integracoes';
import type { UnidadeDeTrabalho, Uuid } from '@pz/kernel';

// Tenants, OABs e publicações FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const ESCRITORIO = '01a10e00-0000-7000-8000-0000000ca001' as Uuid;
const OUTRO = '01a10e00-0000-7000-8000-0000000ca002' as Uuid;

const fonte: FontePublicacoes = {
  buscarPorOab: () =>
    Promise.resolve([
      {
        fonte: 'falsa',
        idExterno: '1',
        hashConteudo: 'b'.repeat(64),
        dataDisponibilizacao: LocalDate.de(2026, 10, 6),
        teor: 'FICTÍCIO',
        destinatarios: [{ oab: { numero: '654321', uf: 'RJ' } }],
        urlFonte: 'https://exemplo.invalid/certidao',
        metadados: {},
      },
    ]),
  buscarPorProcesso: () => Promise.resolve([]),
  saude: () => Promise.resolve({ estado: 'operacional', verificadoEm: relogio.agora() }),
};

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
let manter: ManterAssinaturas<Transacao>;
let planejar: PlanejarCaptura<Transacao>;
let executar: ExecutarCaptura<Transacao>;

const noTenant = <T>(tenant: Uuid, trabalho: (tx: Transacao) => Promise<T>) =>
  executarNoTenant(tenant, () => banco.executar(trabalho));
const oab = (tenantId: Uuid, oabId: string = gerarUuidV7()) => ({
  tenantId,
  payload: { advogadoId: gerarUuidV7(), oabId, numero: '654321', uf: 'RJ', tipo: 'principal' },
});

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar tenants', (tx) =>
    tx.tenant.createMany({
      data: [
        { id: ESCRITORIO, nome: 'Escritório (fictício)', tipo: 'escritorio' },
        { id: OUTRO, nome: 'Outro escritório (fictício)', tipo: 'escritorio' },
      ],
    }),
  );
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 10 });
  const comoSistema: UnidadeDeTrabalho<Transacao> = {
    executar: (trabalho) => sistema.executarComoSistema('captura: teste', trabalho),
  };
  const captura = new CapturaPostgres();
  manter = new ManterAssinaturas(new AssinaturasPostgres(), relogio);
  planejar = new PlanejarCaptura(comoSistema, captura, relogio, { diasIniciais: 7 });
  executar = new ExecutarCaptura(
    comoSistema,
    captura,
    fonte,
    new OutboxPostgres(),
    relogio,
    'falsa',
  );
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

describe('captura no PostgreSQL (HU17)', () => {
  it('assinaturas concorrentes da mesma OAB em dois tenants: um alvo, dois assinantes', async () => {
    await Promise.all([
      noTenant(ESCRITORIO, (tx) => manter.oabAdicionada(tx, oab(ESCRITORIO))),
      noTenant(OUTRO, (tx) => manter.oabAdicionada(tx, oab(OUTRO))),
    ]);
    const alvos = await sistema.executarComoSistema('conferir', (tx) =>
      tx.alvoMonitoramento.findMany({ include: { assinantes: true } }),
    );
    expect(alvos).toHaveLength(1);
    expect(alvos[0]?.assinantes.map((a) => a.tenantId).sort()).toEqual([ESCRITORIO, OUTRO].sort());
    // RLS: cada tenant só enxerga a própria assinatura.
    expect(await noTenant(ESCRITORIO, (tx) => tx.alvoAssinante.count())).toBe(1);
  });

  it('executa uma vez, grava um evento por tenant e o checkpoint na mesma transação', async () => {
    const [plano, ...resto] = await planejar.executar();
    expect(resto).toEqual([]);
    expect(plano).toMatchObject({ valor: '654321/RJ', inicio: '2026-09-30', fim: '2026-10-07' });
    if (plano === undefined) throw new Error('sem plano');

    const [primeira, segunda] = await Promise.all([
      executar.executar(plano),
      executar.executar(plano),
    ]);
    expect([primeira.situacao, segunda.situacao].sort()).toEqual(['entregue', 'ja-entregue']);
    const eventos = await sistema.executarComoSistema('conferir', (tx) =>
      tx.eventoDominio.findMany({ where: { tipo: 'CapturaConcluida' } }),
    );
    expect(eventos.map((e) => e.tenantId).sort()).toEqual([ESCRITORIO, OUTRO].sort());
    expect((await planejar.executar())[0]).toMatchObject({ inicio: '2026-10-06' });
  });

  it('banco recusa alvo com valor fora do formato', async () => {
    await expect(
      noTenant(ESCRITORIO, (tx) =>
        tx.alvoMonitoramento.create({ data: { id: gerarUuidV7(), tipo: 'oab', valor: '12/sp' } }),
      ),
    ).rejects.toThrow(/alvo_monitoramento_valor/);
  });
});
