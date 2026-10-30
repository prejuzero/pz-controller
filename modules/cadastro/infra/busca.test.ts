import { FixedClock, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  MAXIMO_DE_PROCESSOS_NA_BUSCA,
  OabsParaBusca,
  ProcessosParaBusca,
} from '../application/busca.js';

import { AdvogadosEmMemoria } from './em-memoria.js';
import { ProcessosEmMemoria } from './processos-em-memoria.js';

import type { RepositorioDeProcessos } from '../application/portas.js';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

const relogio = new FixedClock(Instant.deIso('2026-10-30T12:00:00.000Z'));

describe('filtros de processo e OAB da busca (HU28)', () => {
  it('recusa filtro amplo demais e repassa o filtro', async () => {
    const filtros: unknown[] = [];
    const muitos = {
      idsNoFiltro: (_tx: TransacaoEmMemoria, f: unknown, limite: number) => {
        filtros.push(f);
        return Promise.resolve(Array.from({ length: limite }, (_, i) => String(i) as Uuid));
      },
    } as unknown as RepositorioDeProcessos<TransacaoEmMemoria>;
    const r = await new ProcessosParaBusca(new OutboxEmMemoria(), muitos).executar({
      tribunal: 'TJSP',
    });
    expect(!r.ok && r.erro.codigo).toBe('validacao');
    expect(filtros).toEqual([{ tribunal: 'TJSP' }]);
    expect(MAXIMO_DE_PROCESSOS_NA_BUSCA).toBe(10_000);
    const vazio = await new ProcessosParaBusca(
      new OutboxEmMemoria(),
      new ProcessosEmMemoria(relogio),
    ).executar({ numeroCnj: '123', orgao: 'vara', comarca: 'x', clienteId: 'c' as Uuid });
    expect(vazio.ok && vazio.valor).toEqual([]);
  });

  it('OAB: valida UF e número; sem inscrição, listas vazias', async () => {
    const oabs = new OabsParaBusca(new OutboxEmMemoria(), new AdvogadosEmMemoria(relogio));
    expect(await oabs.executar('go 12.345')).toEqual({
      ok: true,
      valor: { oabIds: [], usuarioIds: [] },
    });
    expect((await oabs.executar('XX12345')).ok).toBe(false);
    expect((await oabs.executar('GOabc')).ok).toBe(false);
  });

  it('em memória: número parcial, cliente, tribunal, órgão sem caixa e comarca', async () => {
    const processos = new ProcessosEmMemoria(relogio);
    const base = { tenantId: 't', ramo: null, sigiloso: false, cobertura: 'automatica' };
    const linha = (id: string, extra: Record<string, unknown>) =>
      processos.linhas.set(id as Uuid, { ...base, id, ...extra } as never);
    linha('a', {
      numeroCnj: '111',
      clienteId: 'c',
      tribunal: 'TJGO',
      orgao: '1ª Vara Cível',
      comarca: 'Goiânia',
    });
    linha('b', { numeroCnj: '222', clienteId: null, tribunal: 'TJSP', orgao: null, comarca: null });
    const ids = (f: Parameters<ProcessosParaBusca<TransacaoEmMemoria>['executar']>[0]) =>
      new ProcessosParaBusca(new OutboxEmMemoria(), processos).executar(f);
    expect(await ids({ numeroCnj: '11' })).toEqual({ ok: true, valor: ['a'] });
    expect(await ids({ clienteId: 'c' as Uuid, tribunal: 'TJGO' })).toEqual({
      ok: true,
      valor: ['a'],
    });
    expect(await ids({ orgao: 'vara cível' })).toEqual({ ok: true, valor: ['a'] });
    expect(await ids({ comarca: 'GOIÂNIA' })).toEqual({ ok: true, valor: ['a'] });
    expect(await ids({ tribunal: 'TJSP' })).toEqual({ ok: true, valor: ['b'] });
  });
});
