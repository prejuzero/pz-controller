import { FixedClock, gerarUuidV7, Instant, LocalDate, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AvisarNovaIntimacao,
  CancelarLembretes,
  DispararLembretes,
  ProgramarLembretes,
} from '../application/lembretes.js';
import { Notificar } from '../application/notificacoes.js';
import { AlterarPreferencias, ConsultarPreferencias } from '../application/preferencias.js';
import { EnviarResumosDiarios } from '../application/resumo.js';

import {
  ConsentimentosEmMemoria,
  LembretesEmMemoria,
  NotificacoesEmMemoria,
  PreferenciasEmMemoria,
} from './em-memoria.js';

import type { AgendaDoPrazo, PrazoParaLembrete } from '../application/lembretes.js';
import type { ConteudoDoResumo } from '../application/resumo.js';
import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria } from '@pz/kernel';

// Dados FICTÍCIOS (HU31, PZ-199). Vencimento: sexta, 2026-11-13; feriado fictício em 2026-11-12.
const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};
const TENANT = gerarUuidV7();
const ANA = gerarUuidV7();
const PRAZO = gerarUuidV7();
const PROCESSO = gerarUuidV7();
const PORTAL = 'https://app.exemplo.invalid';

/** Datas como o motor devolveria com o feriado do dia 12 (dias úteis antes do dia 13). */
const DATAS: Record<number, string> = {
  0: '2026-11-13',
  1: '2026-11-11',
  2: '2026-11-10',
  5: '2026-11-05',
  10: '2026-10-29',
};

let relogio: FixedClock;
let outbox: OutboxEmMemoria;
let lembretes: LembretesEmMemoria;
let notificacoes: NotificacoesEmMemoria;
let preferencias: PreferenciasEmMemoria;
let prazo: PrazoParaLembrete | undefined;
let auditados: EntradaDeAuditoria[];

const agenda: AgendaDoPrazo = {
  situacao: () => Promise.resolve(prazo),
  datas: (_p, _v, antecedencias) =>
    Promise.resolve(
      antecedencias
        .filter((a) => DATAS[a] !== undefined)
        .map((a) => ({ antecedencia: a, data: d(DATAS[a] ?? '') })),
    ),
};
const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
  registrar: (tx, entrada) => {
    tx.aoConfirmar(() => auditados.push(entrada));
    return Promise.resolve();
  },
};
const notificar = () =>
  new Notificar(
    notificacoes,
    preferencias,
    { emails: () => Promise.resolve({ principal: 'ana@exemplo.invalid', copias: [] }) },
    { suprimidos: () => Promise.resolve(new Set<string>()), suprimir: () => Promise.resolve() },
    new ConsentimentosEmMemoria(),
    outbox,
    relogio,
  );
const programar = () => new ProgramarLembretes(lembretes, preferencias, agenda, relogio);
const disparar = () =>
  new DispararLembretes(
    outbox,
    (_t, trabalho) => trabalho(),
    outbox,
    lembretes,
    agenda,
    () => Promise.resolve('0000001-09.2030.8.09.0001'),
    notificar(),
    PORTAL,
    relogio,
  );
const agendados = () =>
  [...lembretes.linhas.values()]
    .filter((l) => l.situacao === 'agendado')
    .map((l) => `${l.tipo}:${String(l.antecedencia)}:${l.disparoEm.paraIso()}`);
const enviados = () => notificacoes.todas().filter((n) => n.tipo === 'lembrete-prazo');

beforeEach(() => {
  relogio = new FixedClock(Instant.deIso('2026-11-01T12:00:00.000Z'));
  outbox = new OutboxEmMemoria();
  lembretes = new LembretesEmMemoria();
  notificacoes = new NotificacoesEmMemoria();
  preferencias = new PreferenciasEmMemoria();
  auditados = [];
  prazo = {
    prazoId: PRAZO,
    processoId: PROCESSO,
    responsavelId: ANA,
    statusCiencia: 'pendente',
    vencimento: d('2026-11-13'),
    lembrar: true,
  };
});

const atual = (): PrazoParaLembrete => {
  if (prazo === undefined) throw new Error('sem prazo');
  return prazo;
};
const programarAgora = () => outbox.executar((tx) => programar().executar(tx, TENANT, PRAZO));

describe('lembretes escalonados (HU31)', () => {
  it('padrão 5, 2, 1 dia útil antes e no dia, às 8h; feriado no meio pula para o dia útil anterior', async () => {
    await programarAgora();
    expect(agendados()).toEqual([
      'antecedencia:5:2026-11-05T11:00:00.000Z',
      'antecedencia:2:2026-11-10T11:00:00.000Z',
      'antecedencia:1:2026-11-11T11:00:00.000Z',
      'insistencia:1:2026-11-11T17:00:00.000Z',
      'antecedencia:0:2026-11-13T11:00:00.000Z',
      'insistencia:0:2026-11-13T17:00:00.000Z',
    ]);
  });

  it('ajuste do vencimento reprograma; cumprimento cancela tudo', async () => {
    await programarAgora();
    // Reprogramar (ajuste ou recálculo) cancela a agenda anterior e grava a nova.
    await programarAgora();
    expect(agendados()).toHaveLength(6);
    expect([...lembretes.linhas.values()].filter((l) => l.situacao === 'cancelado')).toHaveLength(
      6,
    );
    await outbox.executar((tx) => new CancelarLembretes(lembretes, relogio).executar(tx, PRAZO));
    expect(agendados()).toEqual([]);
    prazo = { ...atual(), lembrar: false };
    await programarAgora();
    expect(agendados()).toEqual([]);
  });

  it('dispara na hora, uma vez; insistência dispensada com ciência; vencimento mudado cancela', async () => {
    await programarAgora();
    relogio.definir(Instant.deIso('2026-11-05T11:00:00.000Z'));
    expect(await disparar().executar()).toEqual({ enviado: 1, cancelado: 0, dispensado: 0 });
    expect(await disparar().executar()).toEqual({ enviado: 0, cancelado: 0, dispensado: 0 });
    expect(enviados()[0]?.dados).toMatchObject({
      vencimento: '13/11/2026',
      link: `${PORTAL}/prazos/${PRAZO}`,
    });

    relogio.definir(Instant.deIso('2026-11-11T18:00:00.000Z'));
    prazo = { ...atual(), statusCiencia: 'confirmada' };
    expect(await disparar().executar()).toEqual({ enviado: 2, cancelado: 0, dispensado: 1 });

    prazo = { ...atual(), vencimento: d('2026-11-20') };
    relogio.definir(Instant.deIso('2026-11-13T18:00:00.000Z'));
    expect(await disparar().executar()).toEqual({ enviado: 0, cancelado: 2, dispensado: 0 });
    expect(enviados()).toHaveLength(3);
  });

  it('prazo sumido ou com outro responsável: cancela; sem número do processo, avisa assim mesmo', async () => {
    await programarAgora();
    relogio.definir(Instant.deIso('2026-11-05T11:00:00.000Z'));
    const semNumero = new DispararLembretes(
      outbox,
      (_t, trabalho) => trabalho(),
      outbox,
      lembretes,
      agenda,
      () => Promise.resolve(undefined),
      notificar(),
      PORTAL,
      relogio,
    );
    expect(await semNumero.executar()).toMatchObject({ enviado: 1 });
    expect(enviados()[0]?.dados).toMatchObject({ numeroProcesso: 'sem número' });
    relogio.definir(Instant.deIso('2026-11-10T11:00:00.000Z'));
    prazo = { ...atual(), responsavelId: PRAZO };
    expect(await disparar().executar()).toMatchObject({ cancelado: 1 });
    relogio.definir(Instant.deIso('2026-11-11T11:00:00.000Z'));
    prazo = undefined;
    expect(await disparar().executar()).toMatchObject({ cancelado: 1 });
  });

  it('preferência muda as antecedências; sem responsável não há lembrete', async () => {
    const alterar = new AlterarPreferencias(outbox, preferencias, trilha, outbox, relogio);
    const r = await alterar.executar(
      { tenantId: TENANT, usuarioId: ANA, canal: 'portal' },
      {
        antecedencias: [10, 0, 0],
        horarioResumo: '18:30',
        ativos: { 'nova-intimacao': true, 'lembrete-prazo': true, 'resumo-diario': false },
      },
    );
    expect(r.ok && r.valor.antecedencias).toEqual([10, 0]);
    expect(auditados.map((a) => a.tipo)).toEqual(['notificacoes.preferencias-alteradas']);
    const eventos = await outbox.executar((tx) => outbox.reservarPendentes(tx, 10));
    expect(eventos.map((e) => e.tipo)).toEqual(['PreferenciasDeNotificacaoAlteradas']);
    expect(await new ConsultarPreferencias(outbox, preferencias).executar(ANA)).toMatchObject({
      horarioResumo: '18:30',
    });
    expect(await new ConsultarPreferencias(outbox, preferencias).executar(PRAZO)).toMatchObject({
      antecedencias: [5, 2, 1, 0],
      horarioResumo: '07:00',
    });
    expect(
      (await alterar.executar({ tenantId: TENANT, usuarioId: ANA, canal: 'portal' }, {})).ok,
    ).toBe(false);

    await programarAgora();
    // 10 dias úteis antes (29/10) já passou: só o do dia, mais a insistência.
    expect(agendados().filter((a) => a.startsWith('antecedencia'))).toEqual([
      'antecedencia:0:2026-11-13T11:00:00.000Z',
    ]);
    expect(await outbox.executar((tx) => lembretes.prazosDoUsuario(tx, ANA))).toEqual([PRAZO]);

    prazo = { ...atual(), responsavelId: null };
    await programarAgora();
    expect(agendados()).toEqual([]);
  });

  it('nova intimação só para publicação (DJEN) e com responsável', async () => {
    const avisar = new AvisarNovaIntimacao(
      agenda,
      () => Promise.resolve(undefined),
      notificar(),
      PORTAL,
    );
    const p = { tenantId: TENANT, prazoId: PRAZO };
    expect(await outbox.executar((tx) => avisar.executar(tx, { ...p, origem: 'manual' }))).toBe(
      'sem-aviso',
    );
    expect(await outbox.executar((tx) => avisar.executar(tx, { ...p, origem: 'djen' }))).toBe(
      'avisado',
    );
    expect(await outbox.executar((tx) => avisar.executar(tx, { ...p, origem: 'djen' }))).toBe(
      'sem-aviso',
    );
    expect(notificacoes.todas()[0]?.dados).toMatchObject({ numeroProcesso: 'sem número' });
    prazo = undefined;
    expect(await outbox.executar((tx) => avisar.executar(tx, { ...p, origem: 'djen' }))).toBe(
      'sem-aviso',
    );
  });
});

describe('resumo diário (HU31)', () => {
  const item = {
    numeroProcesso: '0000001-09.2030.8.09.0001',
    vencimento: '03/11/2026',
    link: `${PORTAL}/x`,
  };
  let conteudo: ConteudoDoResumo;
  const resumos = () =>
    new EnviarResumosDiarios(
      outbox,
      (_t, trabalho) => trabalho(),
      outbox,
      preferencias,
      {
        tenants: () => Promise.resolve([TENANT]),
        usuarios: () => Promise.resolve([ANA]),
        conteudo: () => Promise.resolve(conteudo),
      },
      notificar(),
      PORTAL,
      relogio,
    );

  beforeEach(() => {
    conteudo = { vencemHoje: [item], proximos: [], semCiencia: [item], intimacoes: [] };
  });

  it('no horário configurado, uma vez por dia; vazio e desligado não saem', async () => {
    relogio.definir(Instant.deIso('2026-11-03T09:59:00.000Z'));
    expect(await resumos().executar()).toEqual({ enviados: 0, vazios: 0 });
    relogio.definir(Instant.deIso('2026-11-03T10:00:00.000Z'));
    expect(await resumos().executar()).toEqual({ enviados: 1, vazios: 0 });
    relogio.definir(Instant.deIso('2026-11-03T10:15:00.000Z'));
    expect(await resumos().executar()).toEqual({ enviados: 0, vazios: 0 });
    expect(notificacoes.todas().filter((n) => n.tipo === 'resumo-diario')).toHaveLength(1);

    conteudo = { vencemHoje: [], proximos: [], semCiencia: [], intimacoes: [] };
    relogio.definir(Instant.deIso('2026-11-04T10:00:00.000Z'));
    expect(await resumos().executar()).toEqual({ enviados: 0, vazios: 1 });

    await outbox.executar((tx) =>
      preferencias.gravar(tx, TENANT, ANA, {
        antecedencias: [1],
        horarioResumo: '07:00',
        ativos: { 'nova-intimacao': true, 'lembrete-prazo': true, 'resumo-diario': false },
      }),
    );
    conteudo = { vencemHoje: [item], proximos: [], semCiencia: [], intimacoes: [] };
    relogio.definir(Instant.deIso('2026-11-05T10:00:00.000Z'));
    expect(await resumos().executar()).toEqual({ enviados: 0, vazios: 0 });
  });
});
