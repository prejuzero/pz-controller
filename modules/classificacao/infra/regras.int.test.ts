import { Banco, BancoSistema, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { gerarUuidV7, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ClassificarPorRegras } from '../application/classificar.js';

import { ClassificacoesPostgres } from './classificacoes-postgres.js';
import { RevisaoManualPostgres } from './fila-de-revisao-postgres.js';
import { CuradoriaDeRegrasPostgres, RegrasPostgres } from './regras-postgres.js';
import { ResumosPostgres } from './resumos-postgres.js';
import { TaxonomiaPostgres } from './taxonomia-postgres.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

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

  it('versão publicada é imutável e não se apaga; a aplicação não escreve; só a ativação muda (PZ-313)', async () => {
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
    // A aplicação só muda a ativação (PZ-313); o conteúdo segue imutável pelo trigger.
    await expect(
      executarNoTenant(TENANT, () =>
        banco.executar((tx) =>
          tx.regraClassificacao.update({
            where: { codigo_versao: { codigo: 'r-cit', versao: 2 } },
            data: { padroes: ['.*'] },
          }),
        ),
      ),
    ).rejects.toThrow();
    const vigentes = () =>
      executarNoTenant(TENANT, () => banco.executar((tx) => new RegrasPostgres().vigentes(tx)));
    // Desligar a versão 2 devolve a versão ativa anterior; retirar todas desliga a regra.
    await sistema.executarComoSistema('desligar a v2', (tx) =>
      tx.regraClassificacao.update({
        where: { codigo_versao: { codigo: 'r-cit', versao: 2 } },
        data: { ativa: false },
      }),
    );
    expect((await vigentes()).map((r) => `${r.codigo}@${String(r.versao)}`)).toEqual(['r-cit@1']);
    await sistema.executarComoSistema('retirar regra', (tx) =>
      tx.regraClassificacao.updateMany({ where: { codigo: 'r-cit' }, data: { ativa: false } }),
    );
    expect(
      await executarNoTenant(TENANT, () =>
        banco.executar((tx) => new RegrasPostgres().vigentes(tx)),
      ),
    ).toEqual([]);
  });

  it('classificação: uma por conteúdo, a primeira vale; "ok" exige ato; taxonomia pelo módulo prazos (HU21)', async () => {
    const repo = new ClassificacoesPostgres();
    const conteudo = gerarUuidV7();
    const noTenant = <T>(f: (tx: Transacao) => Promise<T>) =>
      executarNoTenant(TENANT, () => banco.executar(f));
    const base = {
      origem: 'ia' as const,
      situacao: 'ok' as const,
      tipoAto: 'ficticio-citacao',
      confianca: 0.93,
      evidencias: [{ inicio: 0, fim: 7, trecho: 'Cite-se' }],
      prazoCitado: null,
      versaoPrompt: 'classificar-ato@0.1.0',
      modelo: 'claude-haiku-4-5',
    };
    expect(await noTenant((tx) => repo.existe(tx, conteudo))).toBe(false);
    expect(await noTenant((tx) => repo.gravar(tx, conteudo, base))).toBe(true);
    expect(
      await noTenant((tx) => repo.gravar(tx, conteudo, { ...base, situacao: 'a_confirmar' })),
    ).toBe(false);
    expect(await noTenant((tx) => repo.existe(tx, conteudo))).toBe(true);
    const gravada = await sistema.executarComoSistema('conferir', (tx) =>
      tx.classificacao.findUniqueOrThrow({ where: { conteudoId: conteudo } }),
    );
    expect(gravada).toMatchObject({
      situacao: 'ok',
      modelo: 'claude-haiku-4-5',
      prazoCitado: null,
    });
    await expect(
      noTenant((tx) => repo.gravar(tx, gerarUuidV7(), { ...base, tipoAto: null })),
    ).rejects.toThrow();
    expect(
      (await noTenant((tx) => new TaxonomiaPostgres().listar(tx))).map((t) => t.codigo),
    ).toContain('ficticio-citacao');
  });

  it('resumo: um por conteúdo, o primeiro vale; "ok" exige texto e trecho (HU62)', async () => {
    const repo = new ResumosPostgres();
    const conteudo = gerarUuidV7();
    const noTenant = <T>(f: (tx: Transacao) => Promise<T>) =>
      executarNoTenant(TENANT, () => banco.executar(f));
    const ok = {
      situacao: 'ok' as const,
      texto: 'Resumo fictício.',
      providencia: null,
      trechos: ['trecho fictício literal'],
      modelo: 'claude-haiku-4-5',
      versaoPrompt: 'resumir-publicacao@0.3.0',
      motivo: null,
    };
    expect(await noTenant((tx) => repo.existe(tx, conteudo))).toBe(false);
    expect(await noTenant((tx) => repo.gravar(tx, conteudo, ok))).toBe(true);
    expect(await noTenant((tx) => repo.gravar(tx, conteudo, { ...ok, texto: 'outro' }))).toBe(
      false,
    );
    expect(await noTenant((tx) => repo.buscar(tx, conteudo))).toEqual(ok);
    expect(await noTenant((tx) => repo.buscar(tx, gerarUuidV7()))).toBeUndefined();
    await expect(
      noTenant((tx) => repo.gravar(tx, gerarUuidV7(), { ...ok, trechos: [] })),
    ).rejects.toThrow();
  });

  it('fila de revisão manual: só "revisao_manual", em ordem de conteúdo, com cursor (HU21)', async () => {
    const repo = new ClassificacoesPostgres();
    const noTenant = <T>(f: (tx: Transacao) => Promise<T>) =>
      executarNoTenant(TENANT, () => banco.executar(f));
    const semMotivo = {
      origem: 'nenhuma' as const,
      situacao: 'revisao_manual' as const,
      tipoAto: null,
      confianca: null,
      evidencias: [],
      prazoCitado: null,
    };
    const revisao = { ...semMotivo, motivo: 'saida-invalida' as const };
    const [a, b] = [gerarUuidV7(), gerarUuidV7()].sort() as [Uuid, Uuid];
    await noTenant((tx) => repo.gravar(tx, a, revisao));
    await noTenant((tx) => repo.gravar(tx, b, revisao));
    await noTenant((tx) =>
      repo.gravar(tx, gerarUuidV7(), { ...semMotivo, situacao: 'a_confirmar' }),
    );
    const fila = new RevisaoManualPostgres();
    const primeira = await noTenant((tx) => fila.listar(tx, { limite: 1 }));
    expect(primeira).toEqual([
      expect.objectContaining({ conteudoId: a, origem: 'nenhuma', motivo: 'saida-invalida' }),
    ]);
    const resto = await noTenant((tx) => fila.listar(tx, { limite: 10, apos: a }));
    expect(resto.map((i) => i.conteudoId)).toEqual([b]);
  });

  it('curadoria pelo portal (PZ-313): a aplicação propõe e a própria proponente ativa', async () => {
    const repo = new CuradoriaDeRegrasPostgres();
    const noTenant = <T>(t: (tx: Transacao) => Promise<T>) =>
      executarNoTenant(TENANT, () => banco.executar(t));
    const ana = '01a10e00-0000-7000-8000-0000000c0a01' as Uuid;
    const versao = await noTenant((tx) => repo.proximaVersao(tx, 'r-nova'));
    expect(versao).toBe(1);
    await noTenant((tx) =>
      repo.inserir(tx, {
        codigo: 'r-nova',
        versao,
        tipoAto: 'ficticio-citacao',
        padroes: ['\\bintime-se\\b'],
        confianca: 0.9,
        ativa: false,
        propostaPor: ana,
        ativadaPor: null,
        ativadaEm: null,
        retiradaEm: null,
        criadaEm: Instant.deIso('2026-11-11T12:00:00Z'),
      }),
    );
    expect(await noTenant((tx) => repo.tipoAtoExiste(tx, 'ficticio-citacao'))).toBe(true);
    // A própria proponente ativa (uma curadora só, decisão de 11/11/2026).
    await noTenant((tx) =>
      repo.ativar(tx, 'r-nova', 1, ana, Instant.deIso('2026-11-11T12:00:00Z')),
    );
    expect((await noTenant((tx) => repo.versao(tx, 'r-nova', 1)))?.ativadaPor).toBe(ana);
    expect(
      await noTenant((tx) => repo.retirar(tx, 'r-nova', Instant.deIso('2026-11-11T13:00:00Z'))),
    ).toBe(1);
    expect((await noTenant((tx) => repo.listar(tx))).some((r) => r.codigo === 'r-nova')).toBe(true);
  });
});
