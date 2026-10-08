import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { ErroPermanente, ErroTransitorio } from '@pz/integracoes';
import { FixedClock, gerarUuidV7, Instant, LocalDate } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ConsultarStatusDaCaptura,
  ExecutarCaptura,
  ManterAssinaturas,
  PlanejarCaptura,
} from '../application/captura.js';
import { FALHAS_PARA_ALERTAR_ALVO } from '../domain/fonte.js';

import {
  AssinaturasPostgres,
  CapturaPostgres,
  LeituraDoStatusPostgres,
} from './captura-postgres.js';

import type { CapturaPlanejada } from '../application/captura.js';
import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { FontePublicacoes } from '@pz/integracoes';
import type { UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/**
 * QA da HU19 (PZ-153): caos controlado. A fonte fica fora do ar por 3 h em ciclos de captura
 * reais (Postgres, outbox, recuo), volta e a recaptura cobre tudo sem duplicar. Dados FICTÍCIOS.
 */
const relogio = new FixedClock(Instant.deIso('2026-10-07T09:00:00Z'));
const A = gerarUuidV7();
const B = gerarUuidV7();
const OAB_RUIM = '333333/SP';

let foraDoAr = false;
const janelasPedidas: string[] = [];
const fonte: FontePublicacoes = {
  buscarPorOab: (oab, janela) => {
    const valor = `${oab.numero}/${oab.uf}`;
    if (valor === OAB_RUIM) return Promise.reject(new ErroPermanente('OAB recusada', 'falsa'));
    if (foraDoAr) return Promise.reject(new ErroTransitorio('fora do ar', 'falsa'));
    janelasPedidas.push(`${valor} ${janela.inicio.paraIso()}..${janela.fim.paraIso()}`);
    return Promise.resolve([
      {
        fonte: 'falsa',
        idExterno: valor,
        hashConteudo: 'c'.repeat(64),
        dataDisponibilizacao: LocalDate.de(2026, 10, 6),
        teor: 'FICTÍCIO',
        destinatarios: [{ oab }],
        urlFonte: 'https://exemplo.invalid/certidao',
        metadados: {},
      },
    ]);
  },
  buscarPorProcesso: () => Promise.resolve([]),
  saude: () => Promise.resolve({ estado: 'operacional', verificadoEm: relogio.agora() }),
};

const alertas: string[] = [];
let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
let planejar: PlanejarCaptura<Transacao>;
let executar: ExecutarCaptura<Transacao>;
let status: (tenant: Uuid) => ReturnType<ConsultarStatusDaCaptura<Transacao>['executar']>;

const noTenant = <T>(tenant: Uuid, trabalho: (tx: Transacao) => Promise<T>) =>
  executarNoTenant(tenant, () => banco.executar(trabalho));

/** Um ciclo do agendador: planeja e executa cada alvo devido (como os jobs do worker). */
async function ciclo(): Promise<{ planos: CapturaPlanejada[]; falhas: number }> {
  const planos = await planejar.executar();
  let falhas = 0;
  for (const plano of planos) await executar.executar(plano).catch(() => falhas++);
  return { planos, falhas };
}

const contarEventos = (tipo: string) =>
  sistema.executarComoSistema('conferir', (tx) => tx.eventoDominio.count({ where: { tipo } }));

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar tenants', (tx) =>
    tx.tenant.createMany({
      data: [
        { id: A, nome: 'A (fictício)', tipo: 'escritorio' },
        { id: B, nome: 'B (fictício)', tipo: 'escritorio' },
      ],
    }),
  );
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 10 });
  const comoSistema: UnidadeDeTrabalho<Transacao> = {
    executar: (trabalho) => sistema.executarComoSistema('captura: QA', trabalho),
  };
  const manter = new ManterAssinaturas(new AssinaturasPostgres(), relogio);
  const oab = (tenantId: Uuid, numero: string) => ({
    tenantId,
    payload: {
      advogadoId: gerarUuidV7(),
      oabId: gerarUuidV7(),
      numero,
      uf: 'SP',
      tipo: 'principal',
    },
  });
  await noTenant(A, (tx) => manter.oabAdicionada(tx, oab(A, '111111')));
  await noTenant(B, (tx) => manter.oabAdicionada(tx, oab(B, '111111')));
  await noTenant(B, (tx) => manter.oabAdicionada(tx, oab(B, '222222')));
  const captura = new CapturaPostgres();
  planejar = new PlanejarCaptura(comoSistema, captura, relogio, {
    diasIniciais: 7,
    fonte: 'falsa',
  });
  executar = new ExecutarCaptura(
    comoSistema,
    captura,
    fonte,
    new OutboxPostgres(),
    relogio,
    'falsa',
    {
      fonteDegradada: (f, n) => alertas.push(`fonte-degradada ${f} ${String(n)}`),
      fonteRestabelecida: (f, n) => alertas.push(`fonte-restabelecida ${f} ${String(n)}`),
      alvoFalhando: (_id, n) => alertas.push(`alvo-falhando ${String(n)}`),
    },
  );
  const leitura = new LeituraDoStatusPostgres();
  status = (tenant) =>
    new ConsultarStatusDaCaptura(
      { executar: (t) => noTenant(tenant, t) },
      leitura,
      'falsa',
    ).executar();
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

describe('QA: indisponibilidade simulada da fonte (HU19, PZ-153)', () => {
  it('3 h fora do ar: alerta uma vez, faixa no portal, recaptura completa ao voltar e sem duplicatas', async () => {
    expect((await ciclo()).falhas).toBe(0);
    const entreguesAntes = await contarEventos('CapturaConcluida');
    expect(entreguesAntes).toBe(3); // OAB 111111 em A e B, 222222 em B

    // Fora do ar das 10:00 às 13:00: um ciclo por hora, como o cron.
    foraDoAr = true;
    for (const hora of ['10', '11', '12']) {
      relogio.definir(Instant.deIso(`2026-10-07T${hora}:00:00Z`));
      await ciclo();
    }
    expect(alertas).toEqual(['fonte-degradada falsa 3']);
    expect(await contarEventos('FonteDegradada')).toBe(2); // um aviso por escritório
    for (const tenant of [A, B]) {
      expect((await status(tenant)).fonte).toMatchObject({ situacao: 'degradada' }); // faixa
    }

    // Volta às 13:00: o primeiro sucesso restabelece e antecipa quem estava em recuo.
    foraDoAr = false;
    janelasPedidas.length = 0;
    relogio.definir(Instant.deIso('2026-10-07T13:00:00Z'));
    // A rodada das 13:00 leva a sonda (alvos todos em recuo); o sucesso restabelece e antecipa.
    const volta = await ciclo();
    expect(volta).toMatchObject({ falhas: 0, planos: [expect.anything()] });
    expect(alertas.at(-1)).toMatch(/^fonte-restabelecida falsa/);
    // A rodada seguinte já pega os antecipados, sem esperar o fim do recuo.
    const seguinte = await ciclo();
    expect(seguinte.falhas).toBe(0);
    expect(await contarEventos('FonteRestabelecida')).toBe(2);
    // Recaptura desde o último sucesso (07/10, com um dia de sobreposição): nenhum dia perdido.
    // Alvo em dia é consultado a cada rodada; a entrega é que não repete (conferida abaixo).
    expect([...new Set(janelasPedidas)].sort()).toEqual([
      '111111/SP 2026-10-06..2026-10-07',
      '222222/SP 2026-10-06..2026-10-07',
    ]);
    for (const tenant of [A, B]) {
      expect((await status(tenant)).fonte).toMatchObject({ situacao: 'operacional' });
    }

    // Repetir os mesmos jobs não entrega de novo (idempotência por alvo + janela).
    for (const plano of [...volta.planos, ...seguinte.planos]) {
      expect(await executar.executar(plano)).toEqual({ situacao: 'ja-entregue' });
    }
    expect(await contarEventos('CapturaConcluida')).toBe(entreguesAntes + 3);
  });

  it('falha só de uma OAB: alerta específico uma vez e a fonte segue operacional', async () => {
    const manter = new ManterAssinaturas(new AssinaturasPostgres(), relogio);
    await noTenant(A, (tx) =>
      manter.oabAdicionada(tx, {
        tenantId: A,
        payload: {
          advogadoId: gerarUuidV7(),
          oabId: gerarUuidV7(),
          numero: '333333',
          uf: 'SP',
          tipo: 'principal',
        },
      }),
    );
    alertas.length = 0;
    const [ruim] = (await planejar.executar()).filter((p) => p.valor === OAB_RUIM);
    if (ruim === undefined) throw new Error('sem plano da OAB');
    for (let i = 0; i < FALHAS_PARA_ALERTAR_ALVO + 1; i++) {
      await expect(executar.executar(ruim)).rejects.toBeInstanceOf(ErroPermanente);
    }
    expect(alertas).toEqual([`alvo-falhando ${String(FALHAS_PARA_ALERTAR_ALVO)}`]);
    const visto = await status(A);
    expect(visto.fonte).toMatchObject({ situacao: 'operacional' });
    expect(visto.oabs.find((o) => o.oab === OAB_RUIM)).toMatchObject({
      falhasConsecutivas: FALHAS_PARA_ALERTAR_ALVO + 1,
    });
  });
});
