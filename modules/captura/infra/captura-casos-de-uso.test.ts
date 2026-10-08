import { ErroLimiteExcedido, ErroTransitorio } from '@pz/integracoes';
import { FixedClock, gerarUuidV7, Instant, LocalDate, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConsultarStatusDaCaptura,
  ExecutarCaptura,
  ManterAssinaturas,
  PlanejarCaptura,
} from '../application/captura.js';
import { FALHAS_PARA_ALERTAR_ALVO, FALHAS_PARA_DEGRADAR } from '../domain/fonte.js';

import { CapturaEmMemoria } from './em-memoria.js';

import type { FontePublicacoes, PublicacaoCapturada } from '@pz/integracoes';
import type { Uuid } from '@pz/kernel';

// Tenants, OABs e publicações FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const TENANT_A = gerarUuidV7();
const TENANT_B = gerarUuidV7();
const oab = (tenantId: Uuid, oabId: Uuid = gerarUuidV7()) => ({
  tenantId,
  payload: { advogadoId: gerarUuidV7(), oabId, numero: '123456', uf: 'SP', tipo: 'principal' },
});
const publicacao: PublicacaoCapturada = {
  fonte: 'falsa',
  idExterno: '1',
  hashConteudo: 'a'.repeat(64),
  dataDisponibilizacao: LocalDate.de(2026, 10, 6),
  teor: 'FICTÍCIO',
  numeroCnj: '1000004-06.2026.8.26.0100',
  destinatarios: [{ oab: { numero: '123456', uf: 'SP' } }],
  urlFonte: 'https://exemplo.invalid/certidao',
  metadados: {},
};

class FonteFalsa implements FontePublicacoes {
  readonly chamadas: string[] = [];
  falhar: false | 'fora-do-ar' | 'cota' | true = false;
  buscarPorOab(o: { numero: string; uf: string }, j: { inicio: LocalDate; fim: LocalDate }) {
    this.chamadas.push(`oab ${o.numero}/${o.uf} ${j.inicio.paraIso()}..${j.fim.paraIso()}`);
    if (this.falhar === 'cota') return Promise.reject(new ErroLimiteExcedido('429', 'falsa'));
    if (this.falhar !== false) return Promise.reject(new ErroTransitorio('fora do ar', 'falsa'));
    return Promise.resolve([publicacao]);
  }
  buscarPorProcesso(numero: string) {
    this.chamadas.push(`processo ${numero}`);
    return Promise.resolve([publicacao]);
  }
  saude() {
    return Promise.resolve({ estado: 'operacional' as const, verificadoEm: relogio.agora() });
  }
}

let repo: CapturaEmMemoria;
let outbox: OutboxEmMemoria;
let fonte: FonteFalsa;
let manter: ManterAssinaturas<unknown>;
let planejar: PlanejarCaptura<unknown>;
let executar: ExecutarCaptura<unknown>;
let alertas: string[];
const alertasFalsos = () => ({
  fonteDegradada: (f: string, n: number) => alertas.push(`degradada ${f} ${String(n)}`),
  fonteRestabelecida: (f: string, n: number) => alertas.push(`restabelecida ${f} ${String(n)}`),
  alvoFalhando: (_id: Uuid, n: number) => alertas.push(`alvo ${String(n)}`),
});

beforeEach(() => {
  repo = new CapturaEmMemoria();
  outbox = new OutboxEmMemoria();
  fonte = new FonteFalsa();
  manter = new ManterAssinaturas(repo, relogio);
  planejar = new PlanejarCaptura(outbox, repo, relogio, {
    diasIniciais: 7,
  });
  alertas = [];
  executar = new ExecutarCaptura(outbox, repo, fonte, outbox, relogio, 'falsa', alertasFalsos());
});

const emTx = <T>(trabalho: (tx: never) => Promise<T>) =>
  outbox.executar((tx) => trabalho(tx as never));
const eventos = () => outbox.executar((tx) => outbox.reservarPendentes(tx, 100));

describe('assinaturas (HU17)', () => {
  it('a mesma OAB em dois tenants vira um alvo com dois assinantes; repetir não duplica', async () => {
    const evento = oab(TENANT_A);
    await emTx((tx) => manter.oabAdicionada(tx, evento));
    await emTx((tx) => manter.oabAdicionada(tx, evento));
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_B)));
    expect(repo.alvos.size).toBe(1);
    expect(repo.assinaturas.map((a) => a.tenantId)).toEqual([TENANT_A, TENANT_B]);

    await emTx((tx) => manter.oabRemovida(tx, evento));
    await emTx((tx) => manter.oabRemovida(tx, evento));
    expect(repo.assinaturas.map((a) => a.tenantId)).toEqual([TENANT_B]);
  });

  it('processo monitorado assina o alvo pelo número; payload inválido lança', async () => {
    const processoId = gerarUuidV7();
    await emTx((tx) =>
      manter.processoMonitorado(tx, {
        tenantId: TENANT_A,
        payload: {
          processoId,
          numeroCnj: '10000040620268260100',
          tribunal: 'TJSP',
          origem: 'manual',
        },
      }),
    );
    expect(repo.alvo('processo', '10000040620268260100')).toBeDefined();
    await expect(
      emTx((tx) => manter.oabAdicionada(tx, { tenantId: 'x', payload: {} })),
    ).rejects.toThrow();
  });
});

describe('planejamento e execução (HU17)', () => {
  it('uma consulta por alvo, um CapturaConcluida por tenant e checkpoint da janela', async () => {
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_B)));

    const [plano, ...resto] = await planejar.executar();
    expect(resto).toEqual([]);
    expect(plano).toMatchObject({
      tipo: 'oab',
      valor: '123456/SP',
      inicio: '2026-09-30',
      fim: '2026-10-07',
    });

    expect(await executar.executar(plano)).toEqual({
      situacao: 'entregue',
      publicacoes: 1,
      tenants: 2,
    });
    expect(fonte.chamadas).toEqual(['oab 123456/SP 2026-09-30..2026-10-07']);
    const emitidos = await eventos();
    expect(emitidos.map((e) => [e.tipo, e.tenantId])).toEqual([
      ['CapturaConcluida', TENANT_A],
      ['CapturaConcluida', TENANT_B],
    ]);
    expect(emitidos[0]?.payload).toMatchObject({
      janela: { inicio: '2026-09-30', fim: '2026-10-07' },
      fonte: 'falsa',
      publicacoes: [
        {
          idExterno: '1',
          dataDisponibilizacao: '2026-10-06',
          destinatarios: [{ numero: '123456', uf: 'SP' }],
        },
      ],
    });

    // Repetir o mesmo job (retentativa) não entrega de novo.
    expect(await executar.executar(plano)).toEqual({ situacao: 'ja-entregue' });
    expect(await eventos()).toHaveLength(2);
    // A próxima janela começa um dia antes do último fim.
    expect((await planejar.executar())[0]).toMatchObject({
      inicio: '2026-10-06',
      fim: '2026-10-07',
    });
  });

  it('processo: consulta pelo número formatado', async () => {
    await emTx((tx) =>
      manter.processoMonitorado(tx, {
        tenantId: TENANT_A,
        payload: {
          processoId: gerarUuidV7(),
          numeroCnj: '10000040620268260100',
          tribunal: null,
          origem: 'captura',
        },
      }),
    );
    const [plano] = await planejar.executar();
    await executar.executar(plano);
    expect(fonte.chamadas).toEqual(['processo 1000004-06.2026.8.26.0100']);
  });

  it('falha da fonte: registra o recuo, relança e o alvo sai do planejamento até a hora', async () => {
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    const [plano] = await planejar.executar();
    fonte.falhar = true;
    await expect(executar.executar(plano)).rejects.toBeInstanceOf(ErroTransitorio);
    expect(repo.alvo('oab', '123456/SP')?.falhasConsecutivas).toBe(1);
    expect(await planejar.executar()).toEqual([]);
    expect(await eventos()).toHaveLength(0);
  });

  it('alvo sem assinante não é planejado; alvo inexistente não entrega', async () => {
    const evento = oab(TENANT_A);
    await emTx((tx) => manter.oabAdicionada(tx, evento));
    await emTx((tx) => manter.oabRemovida(tx, evento));
    expect(await planejar.executar()).toEqual([]);
    expect(
      await executar.executar({
        alvoId: gerarUuidV7(),
        tipo: 'oab',
        valor: '123456/SP',
        inicio: '2026-10-01',
        fim: '2026-10-07',
      }),
    ).toEqual({ situacao: 'alvo-inexistente' });
    await expect(executar.executar({ alvoId: 'x' })).rejects.toThrow();
  });
});

describe('saúde da fonte e recaptura (HU19)', () => {
  it('falhas seguidas degradam a fonte uma vez: alerta à equipe e aviso a cada escritório', async () => {
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_B)));
    const [plano] = await planejar.executar();
    fonte.falhar = 'fora-do-ar';
    for (let i = 0; i < FALHAS_PARA_DEGRADAR + 1; i++) {
      await expect(executar.executar(plano)).rejects.toBeInstanceOf(ErroTransitorio);
    }
    expect(alertas).toEqual([`degradada falsa ${String(FALHAS_PARA_DEGRADAR)}`]);
    expect(repo.fontes.get('falsa')).toMatchObject({ situacao: 'degradada' });
    const avisos = await eventos();
    expect(avisos.map((e) => [e.tipo, e.tenantId])).toEqual(
      [TENANT_A, TENANT_B].sort().map((t) => ['FonteDegradada', t]),
    );
  });

  it('cota excedida não degrada a fonte; alvo com falhas seguidas gera o alerta específico uma vez', async () => {
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    const [plano] = await planejar.executar();
    fonte.falhar = 'cota';
    for (let i = 0; i < FALHAS_PARA_ALERTAR_ALVO + 1; i++) {
      await expect(executar.executar(plano)).rejects.toBeInstanceOf(ErroLimiteExcedido);
    }
    expect(alertas).toEqual([`alvo ${String(FALHAS_PARA_ALERTAR_ALVO)}`]);
    expect(repo.fontes.get('falsa')).toBeUndefined();
  });

  it('ao restabelecer: antecipa os alvos em recuo, avisa e a janela cobre a indisponibilidade', async () => {
    const relogioProprio = new FixedClock(Instant.deIso('2026-10-01T12:00:00Z'));
    const planejar2 = new PlanejarCaptura(outbox, repo, relogioProprio, { diasIniciais: 7 });
    const executar2 = new ExecutarCaptura(
      outbox,
      repo,
      fonte,
      outbox,
      relogioProprio,
      'falsa',
      alertasFalsos(),
    );
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    await emTx((tx) =>
      manter.processoMonitorado(tx, {
        tenantId: TENANT_A,
        payload: { processoId: gerarUuidV7(), numeroCnj: '1000004-06.2026.8.26.0100' },
      }),
    );
    const planos = await planejar2.executar();
    for (const p of planos) await executar2.executar(p);
    await eventos();
    const oabPlano = planos.find((p) => p.tipo === 'oab');
    // Três dias fora do ar: a OAB falha e fica em recuo; a fonte degrada.
    relogioProprio.definir(Instant.deIso('2026-10-04T12:00:00Z'));
    fonte.falhar = 'fora-do-ar';
    for (let i = 0; i < FALHAS_PARA_DEGRADAR; i++) {
      await expect(
        executar2.executar({ ...oabPlano, inicio: '2026-09-30', fim: '2026-10-04' }),
      ).rejects.toThrow();
    }
    await eventos();
    expect(await planejar2.executar()).toHaveLength(1); // só o processo, sem recuo
    // A fonte volta: o primeiro sucesso (processo) restabelece e antecipa a OAB.
    fonte.falhar = false;
    const [processo] = await planejar2.executar();
    await executar2.executar(processo);
    expect(alertas.at(-1)).toBe('restabelecida falsa 1');
    expect((await eventos()).map((e) => e.tipo)).toContain('FonteRestabelecida');
    const [recaptura] = await planejar2.executar();
    // Janela desde o último sucesso (01/10, com um dia de sobreposição) até hoje.
    expect(recaptura).toMatchObject({ tipo: 'oab', inicio: '2026-09-30', fim: '2026-10-04' });
    expect(repo.fontes.get('falsa')).toMatchObject({
      situacao: 'operacional',
      falhasConsecutivas: 0,
    });
  });

  it('status: fonte e OABs do escritório pela porta de leitura', async () => {
    const status = await new ConsultarStatusDaCaptura(
      outbox,
      {
        fonte: () => Promise.resolve({ id: 'falsa', situacao: 'degradada' as const, desde: null }),
        oabs: () => Promise.resolve([]),
      },
      'falsa',
    ).executar();
    expect(status).toEqual({
      fonte: { id: 'falsa', situacao: 'degradada', desde: null },
      oabs: [],
    });
  });
});
