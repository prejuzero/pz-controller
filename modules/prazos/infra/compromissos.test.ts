import { FixedClock, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AgendarCompromisso,
  CancelarCompromisso,
  ListarCompromissos,
} from '../application/compromissos.js';

import { CompromissosEmMemoria } from './em-memoria.js';

import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS (HU25, PZ-172).
const relogio = new FixedClock(Instant.deIso('2026-10-30T12:00:00.000Z'));
const autor = {
  tenantId: '01a10e00-0000-7000-8000-0000000a0001' as Uuid,
  usuarioId: '01a10e00-0000-7000-8000-0000000a0002' as Uuid,
  canal: 'portal' as const,
};
const PROCESSO = '01a10e00-0000-7000-8000-0000000a0003' as Uuid;

let outbox: OutboxEmMemoria;
let repo: CompromissosEmMemoria;
let registros: EntradaDeAuditoria[];
const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
  registrar: (tx, entrada) => {
    tx.aoConfirmar(() => registros.push(entrada));
    return Promise.resolve();
  },
};
const deps = () => ({ unidade: outbox, compromissos: repo, trilha, outbox, relogio });
const agendar = () => new AgendarCompromisso(deps(), (id) => Promise.resolve(id === PROCESSO));

beforeEach(() => {
  outbox = new OutboxEmMemoria();
  repo = new CompromissosEmMemoria();
  registros = [];
});

describe('compromissos (HU25, PZ-172)', () => {
  it('agenda com lembretes, trilha e evento; cancela com motivo uma vez', async () => {
    const r = await agendar().executar(autor, {
      titulo: 'Audiência de conciliação (FICTÍCIA)',
      dataHora: '2026-11-10T14:00:00-03:00',
      local: 'Sala 3',
      processoId: PROCESSO,
      lembretesMinutos: [60, 1440, 60],
    });
    if (!r.ok) throw r.erro;
    expect(r.valor).toMatchObject({
      dataHora: '2026-11-10T17:00:00.000Z',
      lembretesMinutos: [1440, 60],
      processoId: PROCESSO,
      canceladoEm: null,
    });
    const curto = await new CancelarCompromisso(deps()).executar(autor, r.valor.id, {
      motivo: 'x',
    });
    expect(!curto.ok && curto.erro.codigo).toBe('validacao');
    const c = await new CancelarCompromisso(deps()).executar(autor, r.valor.id, {
      motivo: 'audiência redesignada',
    });
    expect(c.ok && c.valor.motivoCancelamento).toBe('audiência redesignada');
    const deNovo = await new CancelarCompromisso(deps()).executar(autor, r.valor.id, {
      motivo: 'audiência redesignada',
    });
    expect(!deNovo.ok && deNovo.erro.codigo).toBe('compromisso-ja-cancelado');
    const inexistente = await new CancelarCompromisso(deps()).executar(autor, PROCESSO, {
      motivo: 'qualquer motivo',
    });
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('compromisso-inexistente');
    expect(registros.map((x) => x.tipo)).toEqual([
      'prazos.compromisso-agendado',
      'prazos.compromisso-cancelado',
    ]);
    const eventos = await outbox.executar((tx) => outbox.reservarPendentes(tx, 10));
    expect(eventos.map((e) => e.tipo)).toEqual(['CompromissoAgendado', 'CompromissoCancelado']);
  });

  it('recusa sem fuso, processo de outro escritório; lembretes padrão', async () => {
    const semFuso = await agendar().executar(autor, {
      titulo: 'x',
      dataHora: '2026-11-10T14:00:00',
    });
    expect(!semFuso.ok && semFuso.erro.codigo).toBe('validacao');
    const outro = await agendar().executar(autor, {
      titulo: 'Reunião',
      dataHora: '2026-11-10T14:00:00Z',
      processoId: autor.tenantId,
    });
    expect(!outro.ok && outro.erro.codigo).toBe('processo-inexistente');
    const padrao = await agendar().executar(autor, {
      titulo: 'Reunião',
      dataHora: '2026-11-11T14:00:00Z',
      local: '',
    });
    expect(padrao.ok && padrao.valor).toMatchObject({ lembretesMinutos: [1440, 60], local: null });
  });

  it('lista o período por data, sem os cancelados', async () => {
    for (const dataHora of [
      '2026-11-12T10:00:00Z',
      '2026-11-11T10:00:00Z',
      '2026-12-30T10:00:00Z',
    ]) {
      await agendar().executar(autor, { titulo: dataHora, dataHora });
    }
    const listar = new ListarCompromissos(outbox, repo);
    const r = await listar.executar({ de: '2026-11-01T00:00:00Z', ate: '2026-11-30T23:59:59Z' });
    expect(r.ok && r.valor.map((c) => c.titulo)).toEqual([
      '2026-11-11T10:00:00Z',
      '2026-11-12T10:00:00Z',
    ]);
    const invertido = await listar.executar({
      de: '2026-11-30T00:00:00Z',
      ate: '2026-11-01T00:00:00Z',
    });
    expect(!invertido.ok && invertido.erro.codigo).toBe('validacao');
    expect((await listar.executar({})).ok).toBe(false);
  });
});
