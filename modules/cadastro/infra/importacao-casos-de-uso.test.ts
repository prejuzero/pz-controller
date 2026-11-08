import { FixedClock, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConsultarImportacaoDeProcessos,
  ImportarProcessos,
  ProcessarImportacaoDeProcessos,
} from '../application/importacao.js';
import { CadastrarProcesso } from '../application/processos.js';

import {
  ClientesEmMemoria,
  ImportacoesEmMemoria,
  ProcessosEmMemoria,
} from './processos-em-memoria.js';

import type { AutorNoTenant } from '../application/paginacao.js';
import type { EntradaDeAuditoria, OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: números CNJ com dígito conferido.
const A = '0000001-68.2026.8.26.0100';
const B = '1234567-03.2025.5.02.0001';
const C = '0000010-18.2024.4.03.6100';

class TrilhaFalsa implements TrilhaDeAuditoria<TransacaoEmMemoria> {
  readonly registros: { entrada: EntradaDeAuditoria; origem: OrigemDaAuditoria }[] = [];
  registrar(tx: TransacaoEmMemoria, entrada: EntradaDeAuditoria, origem: OrigemDaAuditoria) {
    tx.aoConfirmar(() => this.registros.push({ entrada, origem }));
    return Promise.resolve();
  }
}

describe('importação de processos por CSV (HU42)', () => {
  const relogio = new FixedClock(Instant.deIso('2026-11-08T12:00:00Z'));
  const autor: AutorNoTenant = {
    tenantId: '0199c0de-0000-7000-8000-000000000001' as Uuid,
    usuarioId: '0199c0de-0000-7000-8000-000000000002' as Uuid,
    canal: 'portal',
  };
  let outbox: OutboxEmMemoria;
  let processos: ProcessosEmMemoria;
  let importacoes: ImportacoesEmMemoria;
  let trilha: TrilhaFalsa;
  let importar: ImportarProcessos<TransacaoEmMemoria>;
  let processar: ProcessarImportacaoDeProcessos<TransacaoEmMemoria>;

  beforeEach(() => {
    outbox = new OutboxEmMemoria();
    processos = new ProcessosEmMemoria(relogio);
    importacoes = new ImportacoesEmMemoria();
    trilha = new TrilhaFalsa();
    importar = new ImportarProcessos(outbox, processos, importacoes, trilha, outbox, relogio);
    processar = new ProcessarImportacaoDeProcessos(processos, importacoes, trilha, outbox, relogio);
  });

  const cadastrar = (numeroCnj: string) =>
    new CadastrarProcesso(
      outbox,
      processos,
      new ClientesEmMemoria(processos),
      trilha,
      outbox,
      relogio,
    ).executar(autor, { numeroCnj });

  it('prévia: marca válidas, já cadastradas e inválidas, sem gravar nada', async () => {
    await cadastrar(B);
    const r = await importar.executar(autor, {
      csv: `numeroCnj;comarca\n${A};São Paulo\n${B};\n0000001-00.2026.8.26.0100;`,
    });
    expect(r).toEqual({
      ok: true,
      valor: {
        importacaoId: null,
        linhas: [
          { linha: 2, numeroCnj: A, situacao: 'valida', problemas: [] },
          { linha: 3, numeroCnj: B, situacao: 'ja-cadastrado', problemas: [] },
          {
            linha: 4,
            numeroCnj: null,
            situacao: 'invalida',
            problemas: [expect.objectContaining({ campo: 'numeroCnj' })],
          },
        ],
      },
    });
    // Com linha inválida, pedir a gravação também só devolve a prévia.
    expect(
      await importar.executar(autor, { csv: `numeroCnj\n${A}\nx`, somentePrevia: false }),
    ).toMatchObject({ ok: true, valor: { importacaoId: null } });
    expect(importacoes.linhas.size).toBe(0);
  });

  it('grava o pedido, o worker cadastra uma vez e a consulta acompanha', async () => {
    await cadastrar(B);
    const r = await importar.executar(autor, {
      csv: `numeroCnj;sigiloso\n${A};sim\n${B};\n${C};não`,
      somentePrevia: false,
    });
    if (!r.ok || r.valor.importacaoId === null) throw new Error('esperava o pedido');
    const id = r.valor.importacaoId;
    expect(outbox.pendentes().at(-1)).toMatchObject({
      tipo: 'ImportacaoDeProcessosSolicitada',
      payload: { importacaoId: id },
    });
    const consultar = new ConsultarImportacaoDeProcessos(outbox, importacoes);
    expect(await consultar.executar(id)).toMatchObject({
      ok: true,
      valor: { situacao: 'pendente', total: 2, criados: null },
    });

    // C entrou pela captura entre a prévia e o processamento: conta como já existente.
    await cadastrar(C);
    const evento = { tenantId: autor.tenantId, payload: { importacaoId: id } };
    expect(await outbox.executar((tx) => processar.executar(tx, evento))).toBe('concluida');
    expect(await outbox.executar((tx) => processar.executar(tx, evento))).toBe('ja-concluida');
    expect(await consultar.executar(id)).toEqual({
      ok: true,
      valor: {
        id,
        situacao: 'concluida',
        total: 2,
        criados: 1,
        jaExistiam: 1,
        solicitadaEm: '2026-11-08T12:00:00.000Z',
        concluidaEm: '2026-11-08T12:00:00.000Z',
      },
    });
    const criado = [...processos.linhas.values()].find((p) => p.numeroCnj === A.replace(/\D/g, ''));
    expect(criado).toMatchObject({ sigiloso: true, tribunal: 'TJSP' });
    // Solicitação, C pelo cadastro manual, A pela importação e a conclusão.
    expect(trilha.registros.map((t) => t.entrada.tipo).slice(-4)).toEqual([
      'cadastro.importacao-solicitada',
      'cadastro.processo-cadastrado',
      'cadastro.processo-cadastrado',
      'cadastro.importacao-concluida',
    ]);
    expect(trilha.registros.at(-1)?.origem).toEqual({
      canal: 'sistema',
      usuarioId: autor.usuarioId,
    });
  });

  it('recusa entrada inválida, arquivo ruim e importação sem nada novo', async () => {
    expect(await importar.executar(autor, { csv: '' })).toMatchObject({ ok: false });
    expect(await importar.executar(autor, { csv: 'orgao\nx' })).toMatchObject({ ok: false });
    await cadastrar(A);
    expect(
      await importar.executar(autor, { csv: `numeroCnj\n${A}`, somentePrevia: false }),
    ).toMatchObject({ ok: false, erro: { problemas: [{ campo: 'csv' }] } });
    expect(
      await new ConsultarImportacaoDeProcessos(outbox, importacoes).executar(autor.usuarioId),
    ).toMatchObject({ ok: false, erro: { codigo: 'importacao-nao-encontrada' } });
    await expect(
      outbox.executar((tx) =>
        processar.executar(tx, {
          tenantId: autor.tenantId,
          payload: { importacaoId: autor.usuarioId },
        }),
      ),
    ).rejects.toThrow('não encontrada');
  });
});
