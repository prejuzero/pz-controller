import { Banco, BancoSistema, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { gerarUuidV7 } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ClassificarPorRegras } from '../application/classificar.js';

import { RegrasPostgres } from './regras-postgres.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';

// Taxonomia e regras FICTÍCIAS.
const TENANT = gerarUuidV7();
let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar', async (tx) => {
    await tx.tenant.create({ data: { id: TENANT, nome: 'E (fictício)', tipo: 'escritorio' } });
    await tx.tipoAto.create({
      data: { codigo: 'ficticio-citacao', nome: 'Citação (fictícia)', descricao: 'FICTÍCIO' },
    });
    await tx.regraClassificacao.createMany({
      data: [
        {
          codigo: 'r-cit',
          versao: 1,
          tipoAto: 'ficticio-citacao',
          padroes: ['\\bcitacao\\b'],
          confianca: 0.7,
        },
        {
          codigo: 'r-cit',
          versao: 2,
          tipoAto: 'ficticio-citacao',
          padroes: ['\\bcite-se\\b'],
          confianca: 0.95,
        },
        {
          codigo: 'r-off',
          versao: 1,
          tipoAto: 'ficticio-citacao',
          padroes: ['\\bvistos\\b'],
          confianca: 1,
          ativa: false,
        },
      ],
    });
  });
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 5 });
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

describe('regras rápidas no PostgreSQL (HU20)', () => {
  it('a aplicação lê só a maior versão ativa e classifica', async () => {
    const classificar = new ClassificarPorRegras<Transacao>(
      { executar: (t) => executarNoTenant(TENANT, () => banco.executar(t)) },
      new RegrasPostgres(),
    );
    expect(
      await classificar.executar('Vistos. Cite-se no prazo de 15 (quinze) dias.'),
    ).toMatchObject({
      situacao: 'classificada',
      regra: { codigo: 'r-cit', versao: 2 },
      confianca: 0.95,
      prazoCitado: { quantidade: 15, unidade: 'dias' },
    });
  });

  it('versão publicada é imutável e não se apaga; a aplicação não escreve; só "ativa" muda', async () => {
    await expect(
      sistema.executarComoSistema('tentar alterar', (tx) =>
        tx.regraClassificacao.update({
          where: { codigo_versao: { codigo: 'r-cit', versao: 2 } },
          data: { padroes: ['.*'] },
        }),
      ),
    ).rejects.toThrow(/imutável/);
    await expect(
      sistema.executarComoSistema('tentar apagar', (tx) =>
        tx.regraClassificacao.delete({ where: { codigo_versao: { codigo: 'r-cit', versao: 1 } } }),
      ),
    ).rejects.toThrow(/permission denied|só de inserção/);
    await expect(
      executarNoTenant(TENANT, () =>
        banco.executar((tx) =>
          tx.regraClassificacao.update({
            where: { codigo_versao: { codigo: 'r-cit', versao: 2 } },
            data: { ativa: false },
          }),
        ),
      ),
    ).rejects.toThrow();
    await sistema.executarComoSistema('retirar regra', (tx) =>
      tx.regraClassificacao.update({
        where: { codigo_versao: { codigo: 'r-cit', versao: 2 } },
        data: { ativa: false },
      }),
    );
    expect(
      await executarNoTenant(TENANT, () =>
        banco.executar((tx) => new RegrasPostgres().vigentes(tx)),
      ),
    ).toEqual([]);
  });
});
