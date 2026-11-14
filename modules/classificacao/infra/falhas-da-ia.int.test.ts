import { BancoSistema } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ClassificacoesPostgres } from './classificacoes-postgres.js';

import type { Classificacao } from '../domain/decisao.js';
import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: as falhas da IA no PostgreSQL (reprocessamento, 13/11/2026).
let postgres: BancoDeTeste;
let sistema: BancoSistema;
const repo = new ClassificacoesPostgres();
const FALHA = '01a10e00-0000-7000-8000-0000000cf001' as Uuid;
const OUTRA = '01a10e00-0000-7000-8000-0000000cf002' as Uuid;
const CERTA = '01a10e00-0000-7000-8000-0000000cf003' as Uuid;
const falha: Classificacao = {
  origem: 'ia',
  situacao: 'revisao_manual',
  tipoAto: null,
  confianca: null,
  evidencias: [],
  prazoCitado: null,
  motivo: 'saida-invalida',
};
const executar = <T>(trabalho: (tx: Transacao) => Promise<T>) =>
  sistema.executarComoSistema('teste', trabalho);

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await executar(async (tx) => {
    await tx.tipoAto.upsert({
      where: { codigo: 'contrarrazoes-ficticio' },
      create: { codigo: 'contrarrazoes-ficticio', nome: 'FICTÍCIO', descricao: '' },
      update: {},
    });
    await repo.gravar(tx, FALHA, falha);
    await repo.gravar(tx, OUTRA, falha);
    await repo.gravar(tx, CERTA, {
      origem: 'ia',
      evidencias: [],
      prazoCitado: null,
      situacao: 'ok',
      tipoAto: 'contrarrazoes-ficticio',
      confianca: 0.9,
    });
  });
}, 300_000);

afterAll(async () => {
  await sistema.encerrar();
  await postgres.parar();
});

describe('falhas da IA no PostgreSQL', () => {
  it('lista só as falhas, troca uma vez e espera o intervalo depois de outra tentativa', async () => {
    const agora = Instant.deIso('2030-01-01T00:00:00Z');
    expect(await executar((tx) => repo.pendentes(tx, agora, 10))).toEqual([FALHA, OUTRA]);

    const nova: Classificacao = {
      origem: 'ia',
      situacao: 'ok',
      tipoAto: 'contrarrazoes-ficticio',
      confianca: 0.97,
      evidencias: [{ inicio: 0, fim: 7, trecho: 'FICTÍCIO' }],
      prazoCitado: null,
      versaoPrompt: 'v1',
      modelo: 'modelo-ficticio',
    };
    expect(await executar((tx) => repo.substituir(tx, FALHA, nova))).toBe(true);
    expect(await executar((tx) => repo.substituir(tx, FALHA, nova))).toBe(false);
    expect(await executar((tx) => repo.buscar(tx, FALHA))).toMatchObject({
      situacao: 'ok',
      tipoAto: 'contrarrazoes-ficticio',
      confianca: 0.97,
    });

    // Tentada agora: só volta depois do intervalo.
    const tentativa = Instant.deIso('2029-12-31T23:00:00Z');
    await executar((tx) => repo.registrarTentativa(tx, OUTRA, tentativa));
    expect(await executar((tx) => repo.pendentes(tx, tentativa, 10))).toEqual([]);
    expect(await executar((tx) => repo.pendentes(tx, agora, 10))).toEqual([OUTRA]);
  });
});
