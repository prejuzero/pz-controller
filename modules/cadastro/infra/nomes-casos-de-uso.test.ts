import { FixedClock, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AdicionarNomeMonitorado,
  ListarNomesMonitorados,
  MAXIMO_DE_NOMES_MONITORADOS,
  RemoverNomeMonitorado,
} from '../application/nomes.js';

import { NomesMonitoradosEmMemoria } from './processos-em-memoria.js';

import type { AutorNoTenant } from '../application/paginacao.js';
import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Nomes FICTÍCIOS.
class TrilhaFalsa implements TrilhaDeAuditoria<TransacaoEmMemoria> {
  readonly tipos: string[] = [];
  registrar(tx: TransacaoEmMemoria, entrada: EntradaDeAuditoria) {
    tx.aoConfirmar(() => this.tipos.push(entrada.tipo));
    return Promise.resolve();
  }
}

describe('nomes monitorados do escritório (HU42)', () => {
  const relogio = new FixedClock(Instant.deIso('2026-11-08T12:00:00Z'));
  const autor: AutorNoTenant = {
    tenantId: '0199c0de-0000-7000-8000-000000000001' as Uuid,
    usuarioId: '0199c0de-0000-7000-8000-000000000002' as Uuid,
    canal: 'portal',
  };
  let outbox: OutboxEmMemoria;
  let nomes: NomesMonitoradosEmMemoria;
  let trilha: TrilhaFalsa;
  let adicionar: AdicionarNomeMonitorado<TransacaoEmMemoria>;

  beforeEach(() => {
    outbox = new OutboxEmMemoria();
    nomes = new NomesMonitoradosEmMemoria();
    trilha = new TrilhaFalsa();
    adicionar = new AdicionarNomeMonitorado(outbox, nomes, trilha, outbox, relogio);
  });

  it('adiciona com evento e trilha, recusa repetido em outra grafia e remove', async () => {
    const r = await adicionar.executar(autor, { nome: '  Sociedade  Fictícia de Advogados ' });
    if (!r.ok) throw r.erro;
    expect(r.valor).toMatchObject({ nome: 'Sociedade Fictícia de Advogados' });
    expect(outbox.pendentes().at(-1)).toMatchObject({
      tipo: 'NomeMonitoradoAdicionado',
      payload: { nomeId: r.valor.id, nome: 'SOCIEDADE FICTÍCIA DE ADVOGADOS' },
    });
    expect(
      await adicionar.executar(autor, { nome: 'SOCIEDADE FICTÍCIA DE ADVOGADOS' }),
    ).toMatchObject({ ok: false, erro: { codigo: 'nome-ja-monitorado' } });
    expect(await new ListarNomesMonitorados(outbox, nomes).executar()).toHaveLength(1);

    const remover = new RemoverNomeMonitorado(outbox, nomes, trilha, outbox, relogio);
    expect(await remover.executar(autor, r.valor.id)).toEqual({ ok: true, valor: undefined });
    expect(outbox.pendentes().at(-1)).toMatchObject({ tipo: 'NomeMonitoradoRemovido' });
    expect(await remover.executar(autor, r.valor.id)).toMatchObject({
      ok: false,
      erro: { codigo: 'nome-nao-encontrado' },
    });
    expect(trilha.tipos).toEqual([
      'cadastro.nome-monitorado-adicionado',
      'cadastro.nome-monitorado-removido',
    ]);
    expect(await new ListarNomesMonitorados(outbox, nomes).executar()).toEqual([]);
  });

  it('recusa nome curto, entrada inválida e mais que o limite', async () => {
    expect(await adicionar.executar(autor, { nome: 'abc' })).toMatchObject({ ok: false });
    expect(await adicionar.executar(autor, { outro: 1 })).toMatchObject({ ok: false });
    for (let i = 0; i < MAXIMO_DE_NOMES_MONITORADOS; i++) {
      expect(
        (await adicionar.executar(autor, { nome: `Sociedade Fictícia ${String(i)}` })).ok,
      ).toBe(true);
    }
    expect(await adicionar.executar(autor, { nome: 'Sociedade Fictícia Extra' })).toMatchObject({
      ok: false,
      erro: { codigo: 'limite-de-nomes' },
    });
  });
});
