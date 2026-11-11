import { FixedClock, gerarUuidV7, Instant, LocalDate, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  ConsultarFeedDaAgenda,
  CriarFeedDaAgenda,
  GerarAgendaIcs,
  LerFeedDaAgenda,
  RevogarFeedDaAgenda,
} from '../application/agenda.js';

import { FeedsEmMemoria } from './feeds-em-memoria.js';
import { tokensDoFeed } from './feeds-postgres.js';

import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Prazos e escritório FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-11-09T12:00:00Z'));
const TENANT = gerarUuidV7();
const USUARIO = gerarUuidV7();
const VENCIMENTO = (() => {
  const r = LocalDate.analisar('2027-03-24');
  if (!r.ok) throw r.erro;
  return r.valor;
})();

function montar() {
  const unidade = new OutboxEmMemoria();
  const feeds = new FeedsEmMemoria();
  const tipos: string[] = [];
  const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
    registrar: (tx, e: EntradaDeAuditoria) => {
      tx.aoConfirmar(() => tipos.push(e.tipo));
      return Promise.resolve();
    },
  };
  const pedidos: unknown[] = [];
  const gerar = new GerarAgendaIcs(
    {
      prazosAbertos: (u) => {
        pedidos.push(u);
        return Promise.resolve([
          {
            id: 'p1',
            vencimento: VENCIMENTO,
            status: 'a-confirmar' as const,
            nomeDoAto: 'Contestação',
            numeroCnj: '0000001-68.2026.8.26.0100',
            sigiloso: false,
          },
        ]);
      },
    },
    relogio,
    'https://portal.exemplo.invalid',
  );
  const noTenant = <R>(_t: Uuid, trabalho: () => Promise<R>) => trabalho();
  return {
    feeds,
    tipos,
    pedidos,
    gerar,
    consultar: new ConsultarFeedDaAgenda(unidade, feeds),
    criar: new CriarFeedDaAgenda(unidade, feeds, tokensDoFeed, trilha, relogio),
    revogar: new RevogarFeedDaAgenda(unidade, feeds, trilha, relogio),
    ler: new LerFeedDaAgenda(unidade, feeds, tokensDoFeed, noTenant, gerar, relogio),
  };
}
const usuario = { tenantId: TENANT, usuarioId: USUARIO, canal: 'portal' as const };

describe('agenda .ics e feed privado (HU50)', () => {
  it('cria o feed (só o hash guardado), lê pela agenda e registra o acesso', async () => {
    const m = montar();
    const { token } = await m.criar.executar(usuario);
    expect(m.feeds.feeds[0]?.tokenHash).toBe(tokensDoFeed.hash(token));
    expect(m.feeds.feeds[0]?.tokenHash).not.toBe(token);
    const lido = await m.ler.executar(token);
    expect(lido.ok && lido.valor).toContain('SUMMARY:Prazo: Contestação (a confirmar)');
    expect(m.pedidos).toEqual([{ tenantId: TENANT, usuarioId: USUARIO }]);
    expect((await m.consultar.executar(USUARIO))?.ultimoAcesso).toEqual(relogio.agora());
    expect(m.tipos).toEqual(['relatorios.feed-agenda-criado']);
  });

  it('criar de novo troca o token; revogar derruba; token errado ou escritório suspenso não lê', async () => {
    const m = montar();
    const primeiro = await m.criar.executar(usuario);
    const segundo = await m.criar.executar(usuario);
    expect((await m.ler.executar(primeiro.token)).ok).toBe(false);
    expect((await m.ler.executar(segundo.token)).ok).toBe(true);
    m.feeds.tenantsSuspensos.add(TENANT);
    expect((await m.ler.executar(segundo.token)).ok).toBe(false);
    m.feeds.tenantsSuspensos.clear();
    expect((await m.revogar.executar(usuario)).ok).toBe(true);
    expect((await m.ler.executar(segundo.token)).ok).toBe(false);
    expect(await m.revogar.executar(usuario)).toMatchObject({
      ok: false,
      erro: { codigo: 'feed-inexistente' },
    });
    expect((await m.ler.executar('nao-existe')).ok).toBe(false);
    expect(await m.consultar.executar(USUARIO)).toBeUndefined();
    expect(m.tipos).toEqual([
      'relatorios.feed-agenda-criado',
      'relatorios.feed-agenda-criado',
      'relatorios.feed-agenda-revogado',
    ]);
  });

  it('download: o mesmo .ics, pela sessão', async () => {
    const ics = await montar().gerar.executar(usuario);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('X-WR-CALNAME:PrejuZero · prazos');
  });
});
