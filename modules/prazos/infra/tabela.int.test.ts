import { TrilhaPostgres } from '@pz/auditoria';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AprovarVersaoDaTabela,
  CadastrarTipoDeAto,
  ProporVersaoDaTabela,
  ResolverPrazoAplicavel,
} from '../application/tabela-de-prazos.js';
import { ANA, BETO, PLATAFORMA, relogio } from '../teste/ficticios.js';

import { TabelaPostgres, TiposDeAtoPostgres } from './tabela-postgres.js';

import type { CuradorEmAcao } from '../application/tabela-de-prazos.js';
import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS de teste: exercitam o mecanismo, não são regras jurídicas.
const ESCRITORIO = '01a10e00-0000-7000-8000-0000000f0e01' as Uuid;
const ana: CuradorEmAcao = { ...ANA, canal: 'portal' };
const beto: CuradorEmAcao = { ...BETO, canal: 'portal' };
const proposta = (parcial: Record<string, unknown> = {}) => ({
  tipoAto: 'ato-ficticio',
  ramo: 'civel',
  dias: 7,
  unidade: 'dias',
  fundamento: 'FICTÍCIO: Lei de Teste, art. 1º',
  fonteUrl: 'https://exemplo.invalid/ficticio',
  vigenciaInicio: '2020-01-01',
  ...parcial,
});

let postgres: BancoDeTeste;
let banco: Banco;
let propor: ProporVersaoDaTabela<Transacao>;
let aprovar: AprovarVersaoDaTabela<Transacao>;
let resolver: ResolverPrazoAplicavel<Transacao>;

const naPlataforma = <T>(trabalho: () => Promise<T>) => executarNoTenant(PLATAFORMA, trabalho);

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  const preparo = new BancoSistema({ url: postgres.url('pz_sistema') });
  await preparo.executarComoSistema('preparar tenants', (tx) =>
    tx.tenant.createMany({
      data: [
        { id: PLATAFORMA, nome: 'PrejuZero (fictício)', tipo: 'plataforma' },
        { id: ESCRITORIO, nome: 'Escritório (fictício)', tipo: 'escritorio' },
      ],
    }),
  );
  await preparo.encerrar();
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 10 });
  const tabela = new TabelaPostgres();
  const tipos = new TiposDeAtoPostgres();
  const trilha = new TrilhaPostgres();
  const r = relogio();
  propor = new ProporVersaoDaTabela(banco, tipos, tabela, trilha, r);
  aprovar = new AprovarVersaoDaTabela(banco, tabela, trilha, new OutboxPostgres(), r);
  resolver = new ResolverPrazoAplicavel(banco, tabela);
  const cadastrar = new CadastrarTipoDeAto(banco, tipos, trilha);
  for (const codigo of ['ato-ficticio', 'outro-ficticio']) {
    const c = await naPlataforma(() =>
      cadastrar.executar(ana, { codigo, nome: codigo, descricao: '' }),
    );
    if (!c.ok) throw c.erro;
  }
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await postgres.parar();
});

async function proporEAprovar(parcial: Record<string, unknown> = {}) {
  const r = await naPlataforma(() => propor.executar(ana, proposta(parcial)));
  if (!r.ok) throw r.erro;
  const a = await naPlataforma(() => aprovar.executar(beto, r.valor.id));
  if (!a.ok) throw a.erro;
  return a.valor;
}

describe('tabela de prazos no PostgreSQL (HU15)', () => {
  it('aprovação grava auditoria e evento no tenant plataforma, na mesma transação', async () => {
    const versao = await proporEAprovar({ tipoAto: 'outro-ficticio' });
    const [auditoria, eventos] = await naPlataforma(() =>
      banco.executar(async (tx) => [
        await tx.eventoAuditoria.findMany({
          where: { entidadeId: versao.id },
          orderBy: { sequencia: 'asc' },
        }),
        await tx.eventoDominio.findMany({ where: { agregadoId: versao.id } }),
      ]),
    );
    expect(auditoria.map((a) => [a.tipo, a.usuarioId])).toEqual([
      ['prazos.versao-da-tabela-proposta', ANA.usuarioId],
      ['prazos.versao-da-tabela-aprovada', BETO.usuarioId],
    ]);
    expect(eventos.map((e) => [e.tipo, e.tenantId])).toEqual([['TabelaPrazoAprovada', PLATAFORMA]]);
  });

  it('vigência pela data do ato, com datas jurídicas sem deslocamento de fuso', async () => {
    await proporEAprovar({ dias: 9, vigenciaInicio: '2024-02-29' });
    const pedir = (dataDoAto: string) =>
      executarNoTenant(ESCRITORIO, () =>
        resolver.executar({ tipoAto: 'ato-ficticio', ramo: 'civel', dataDoAto }),
      );
    const [antes, depois] = [await pedir('2024-02-28'), await pedir('2024-02-29')];
    // Antes da versão 2 não há outra aprovada vigente para este ato: só a genérica (não cadastrada).
    expect(antes.ok && antes.valor.avisos).toEqual(['sem-regra-legal-cadastrada']);
    expect(depois.ok && [depois.valor.aplicado?.dias, depois.valor.tabela?.fundamento]).toEqual([
      9,
      'FICTÍCIO: Lei de Teste, art. 1º',
    ]);
  });

  it('aprovações concorrentes da mesma versão: só uma vale e só um evento sai', async () => {
    const r = await naPlataforma(() => propor.executar(ana, proposta({ ramo: 'penal' })));
    if (!r.ok) throw r.erro;
    const resultados = await Promise.all(
      [1, 2, 3].map(() => naPlataforma(() => aprovar.executar(beto, r.valor.id))),
    );
    expect(resultados.filter((x) => x.ok)).toHaveLength(1);
    expect(resultados.flatMap((x) => (x.ok ? [] : [x.erro.codigo]))).toEqual([
      'versao-ja-aprovada',
      'versao-ja-aprovada',
    ]);
    const eventos = await naPlataforma(() =>
      banco.executar((tx) => tx.eventoDominio.count({ where: { agregadoId: r.valor.id } })),
    );
    expect(eventos).toBe(1);
  });

  it('propostas concorrentes nunca repetem o número da versão', async () => {
    const resultados = await Promise.all(
      [1, 2, 3, 4].map(() =>
        naPlataforma(() => propor.executar(ana, proposta({ ramo: 'juizados' }))),
      ),
    );
    const numeros = resultados.flatMap((x) => (x.ok ? [x.valor.versao] : []));
    expect(new Set(numeros).size).toBe(numeros.length);
    expect(new Set(resultados.flatMap((x) => (x.ok ? [] : [x.erro.codigo])))).toEqual(
      new Set(numeros.length === 4 ? [] : ['versao-concorrente']),
    );
  });

  describe('garantias no banco', () => {
    it('versão aprovada não é editada nem apagada, nem pelo dono da tabela', async () => {
      const versao = await proporEAprovar({ ramo: 'trabalhista' });
      const migrador = await postgres.conectar('pz_migrator');
      try {
        await expect(
          migrador.query('UPDATE tabela_prazo SET dias = 99 WHERE id = $1', [versao.id]),
        ).rejects.toThrow(/imutável/);
        await expect(
          migrador.query('DELETE FROM tabela_prazo WHERE id = $1', [versao.id]),
        ).rejects.toThrow(/imutável/);
      } finally {
        await migrador.end();
      }
    });

    it('rascunho só muda na transição para aprovado, sem alterar o conteúdo', async () => {
      const r = await naPlataforma(() =>
        propor.executar(ana, proposta({ tipoAto: 'outro-ficticio', ramo: 'penal' })),
      );
      if (!r.ok) throw r.erro;
      const app = await postgres.conectar('pz_app');
      try {
        await expect(
          app.query('UPDATE tabela_prazo SET dias = 99 WHERE id = $1', [r.valor.id]),
        ).rejects.toThrow(/imutável/);
        await expect(
          app.query(
            `UPDATE tabela_prazo SET status = 'aprovado', dias = 99, aprovado_por = $2, aprovado_em = now() WHERE id = $1`,
            [r.valor.id, BETO.usuarioId],
          ),
        ).rejects.toThrow(/imutável/);
        await expect(
          app.query('DELETE FROM tabela_prazo WHERE id = $1', [r.valor.id]),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await app.end();
      }
    });

    it('quatro olhos também no banco: o proponente não aprova', async () => {
      const r = await naPlataforma(() =>
        propor.executar(ana, proposta({ tipoAto: 'outro-ficticio', ramo: 'juizados' })),
      );
      if (!r.ok) throw r.erro;
      const app = await postgres.conectar('pz_app');
      try {
        await expect(
          app.query(
            `UPDATE tabela_prazo SET status = 'aprovado', aprovado_por = proposto_por, aprovado_em = now() WHERE id = $1`,
            [r.valor.id],
          ),
        ).rejects.toThrow(/tabela_prazo_aprovacao/);
      } finally {
        await app.end();
      }
    });
  });
});
