import { BancoSistema } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RamosDasClassesPostgres } from './ramos-das-classes-postgres.js';

import type { VersaoDoRamoDaClasse } from '../application/ramos-das-classes.js';
import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Classes e fundamentos FICTÍCIOS: o repositório da correspondência classe → ramo no PostgreSQL.
let postgres: BancoDeTeste;
let sistema: BancoSistema;
const repo = new RamosDasClassesPostgres();
const CURADORA = '01a10e00-0000-7000-8000-0000000c0c01' as Uuid;
const versao = (id: string, classe: string, numero: number, ramo: VersaoDoRamoDaClasse['ramo']) =>
  ({
    id: id as Uuid,
    classe,
    ramo,
    versao: numero,
    fundamento: 'FICTÍCIO',
    fonteUrl: 'https://exemplo.invalid',
    status: 'rascunho',
    propostoPor: CURADORA,
    propostoEm: Instant.deIso('2026-11-14T12:00:00Z'),
  }) satisfies VersaoDoRamoDaClasse;
const executar = <T>(trabalho: (tx: Transacao) => Promise<T>) =>
  sistema.executarComoSistema('teste', trabalho);

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
}, 300_000);

afterAll(async () => {
  await sistema.encerrar();
  await postgres.parar();
});

describe('ramo da classe no PostgreSQL', () => {
  it('rascunho não vale; aprovada vale e não muda; a versão mais nova aprovada prevalece', async () => {
    const classe = 'PROCEDIMENTO DO JUIZADO ESPECIAL CRIMINAL';
    const v1 = versao('01a10e00-0000-7000-8000-0000000c0c11', classe, 1, 'juizado-criminal');
    expect(await executar((tx) => repo.proximaVersao(tx, classe))).toBe(1);
    expect(await executar((tx) => repo.inserir(tx, v1))).toBe(true);
    expect(
      await executar((tx) =>
        repo.inserir(tx, { ...v1, id: '01a10e00-0000-7000-8000-0000000c0c19' as Uuid }),
      ),
    ).toBe(false);
    expect(await executar((tx) => repo.ramoAprovado(tx, classe))).toBeUndefined();

    const em = Instant.deIso('2026-11-14T13:00:00Z');
    expect(await executar((tx) => repo.aprovar(tx, v1.id, CURADORA, em))).toBe(true);
    expect(await executar((tx) => repo.aprovar(tx, v1.id, CURADORA, em))).toBe(false);
    expect(await executar((tx) => repo.ramoAprovado(tx, classe))).toBe('juizado-criminal');
    expect(await executar((tx) => repo.buscar(tx, v1.id))).toMatchObject({
      status: 'aprovado',
      aprovadoPor: CURADORA,
    });

    // Imutável: nem o sistema altera ou apaga uma versão aprovada.
    await expect(
      executar((tx) => tx.ramoDaClasse.update({ where: { id: v1.id }, data: { ramo: 'penal' } })),
    ).rejects.toThrow(/imutável/);
    await expect(
      executar((tx) => tx.ramoDaClasse.delete({ where: { id: v1.id } })),
    ).rejects.toThrow(/imutável/);

    const v2 = versao('01a10e00-0000-7000-8000-0000000c0c12', classe, 2, 'penal');
    expect(await executar((tx) => repo.proximaVersao(tx, classe))).toBe(2);
    await executar((tx) => repo.inserir(tx, v2));
    await executar((tx) => repo.aprovar(tx, v2.id, CURADORA, em));
    expect(await executar((tx) => repo.ramoAprovado(tx, classe))).toBe('penal');
    expect((await executar((tx) => repo.listar(tx))).map((v) => v.versao)).toEqual([1, 2]);
  });
});
