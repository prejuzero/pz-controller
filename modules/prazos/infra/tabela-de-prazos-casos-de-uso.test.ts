import { OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AprovarVersaoDaTabela,
  CadastrarTipoDeAto,
  ConsultarTabelaDePrazos,
  ProporVersaoDaTabela,
  ResolverPrazoAplicavel,
} from '../application/tabela-de-prazos.js';
import { CODIGO_MANIFESTACAO_GENERICA } from '../domain/resolucao.js';
import { ANA, BETO, relogio } from '../teste/ficticios.js';

import { TabelaEmMemoria } from './em-memoria.js';

import type { CuradorEmAcao } from '../application/tabela-de-prazos.js';
import type { EntradaDeAuditoria, OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

class TrilhaFalsa implements TrilhaDeAuditoria<TransacaoEmMemoria> {
  readonly registros: { entrada: EntradaDeAuditoria; origem: OrigemDaAuditoria }[] = [];
  registrar(transacao: TransacaoEmMemoria, entrada: EntradaDeAuditoria, origem: OrigemDaAuditoria) {
    transacao.aoConfirmar(() => this.registros.push({ entrada, origem }));
    return Promise.resolve();
  }
}

const ana: CuradorEmAcao = { ...ANA, canal: 'portal' };
const beto: CuradorEmAcao = { ...BETO, canal: 'portal' };
// Conteúdo FICTÍCIO (só exercita o mecanismo).
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

let outbox: OutboxEmMemoria;
let repositorio: TabelaEmMemoria;
let trilha: TrilhaFalsa;
let cadastrar: CadastrarTipoDeAto<TransacaoEmMemoria>;
let propor: ProporVersaoDaTabela<TransacaoEmMemoria>;
let aprovar: AprovarVersaoDaTabela<TransacaoEmMemoria>;
let consultar: ConsultarTabelaDePrazos<TransacaoEmMemoria>;
let resolver: ResolverPrazoAplicavel<TransacaoEmMemoria>;

const eventosNoOutbox = () => outbox.executar((tx) => outbox.reservarPendentes(tx, 100));

async function proporEAprovar(parcial: Record<string, unknown> = {}) {
  const r = await propor.executar(ana, proposta(parcial));
  if (!r.ok) throw r.erro;
  const a = await aprovar.executar(beto, r.valor.id);
  if (!a.ok) throw a.erro;
  return a.valor;
}

beforeEach(async () => {
  outbox = new OutboxEmMemoria();
  repositorio = new TabelaEmMemoria();
  trilha = new TrilhaFalsa();
  const r = relogio();
  cadastrar = new CadastrarTipoDeAto(outbox, repositorio, trilha);
  propor = new ProporVersaoDaTabela(outbox, repositorio, repositorio, trilha, r);
  aprovar = new AprovarVersaoDaTabela(outbox, repositorio, trilha, outbox, r);
  consultar = new ConsultarTabelaDePrazos(outbox, repositorio, repositorio);
  resolver = new ResolverPrazoAplicavel(outbox, repositorio);
  for (const codigo of ['ato-ficticio', CODIGO_MANIFESTACAO_GENERICA]) {
    await cadastrar.executar(ana, { codigo, nome: `FICTÍCIO ${codigo}`, descricao: '' });
  }
  trilha.registros.length = 0;
});

describe('taxonomia de atos (HU15)', () => {
  it('cadastra com auditoria e recusa código repetido ou inválido', async () => {
    const r = await cadastrar.executar(ana, {
      codigo: 'outro-ato',
      nome: 'Outro',
      descricao: 'x',
      sinonimos: ['o'],
    });
    expect(r).toEqual({ ok: true, valor: 'outro-ato' });
    expect(trilha.registros[0]).toMatchObject({
      entrada: { tipo: 'prazos.tipo-de-ato-cadastrado', entidadeId: 'outro-ato' },
      origem: { canal: 'portal', usuarioId: ANA.usuarioId },
    });
    const repetido = await cadastrar.executar(ana, {
      codigo: 'outro-ato',
      nome: 'X',
      descricao: '',
    });
    expect(!repetido.ok && repetido.erro.codigo).toBe('tipo-de-ato-existente');
    const invalido = await cadastrar.executar(ana, {
      codigo: 'Outro Ato',
      nome: 'X',
      descricao: '',
    });
    expect(!invalido.ok && invalido.erro.categoria).toBe('validacao');
    expect((await consultar.tiposDeAto()).map((t) => t.codigo).sort()).toEqual([
      'ato-ficticio',
      CODIGO_MANIFESTACAO_GENERICA,
      'outro-ato',
    ]);
  });
});

describe('fluxo de proposta e aprovação (HU15)', () => {
  it('proposta nasce rascunho, numerada por ato e ramo, com auditoria', async () => {
    const r1 = await propor.executar(ana, proposta());
    const r2 = await propor.executar(ana, proposta({ ramo: 'trabalhista' }));
    const r3 = await propor.executar(ana, proposta({ vigenciaFim: '2030-12-31' }));
    expect([r1, r2, r3].map((r) => r.ok && [r.valor.ramo, r.valor.versao, r.valor.status])).toEqual(
      [
        ['civel', 1, 'rascunho'],
        ['trabalhista', 1, 'rascunho'],
        ['civel', 2, 'rascunho'],
      ],
    );
    expect(r3.ok && r3.valor.vigenciaFim).toBe('2030-12-31');
    expect(trilha.registros.map((x) => x.entrada.tipo)).toEqual(
      Array(3).fill('prazos.versao-da-tabela-proposta'),
    );
  });

  it('recusa entrada inválida e ato fora da taxonomia', async () => {
    const invalida = await propor.executar(
      ana,
      proposta({ dias: -1, vigenciaInicio: '2020-02-30', extra: 1 }),
    );
    expect(!invalida.ok && invalida.erro.categoria).toBe('validacao');
    const semAto = await propor.executar(ana, proposta({ tipoAto: 'nao-cadastrado' }));
    expect(!semAto.ok && semAto.erro.categoria).toBe('validacao');
    const fimAntes = await propor.executar(ana, proposta({ vigenciaFim: '2019-01-01' }));
    expect(!fimAntes.ok && fimAntes.erro.categoria).toBe('validacao');
    expect(trilha.registros).toEqual([]);
  });

  it('aprovação pelo próprio proponente é recusada, sem auditoria nem evento', async () => {
    const r = await propor.executar(ana, proposta());
    if (!r.ok) throw r.erro;
    trilha.registros.length = 0;
    const a = await aprovar.executar(ana, r.valor.id);
    expect(!a.ok && a.erro.codigo).toBe('aprovacao-pelo-proponente');
    expect(trilha.registros).toEqual([]);
    expect(await eventosNoOutbox()).toEqual([]);
  });

  it('aprovação por outra pessoa: auditoria com antes e depois e evento no outbox', async () => {
    const versao = await proporEAprovar();
    expect(versao).toMatchObject({ status: 'aprovado', aprovadoPor: BETO.usuarioId });
    const auditoria = trilha.registros.at(-1);
    expect(auditoria?.entrada).toMatchObject({
      tipo: 'prazos.versao-da-tabela-aprovada',
      antes: { status: 'rascunho' },
      depois: { status: 'aprovado' },
    });
    expect((await eventosNoOutbox()).map((e) => [e.tipo, e.tenantId])).toEqual([
      ['TabelaPrazoAprovada', BETO.tenantId],
    ]);
  });

  it('versão inexistente ou já aprovada', async () => {
    const inexistente = await aprovar.executar(
      beto,
      '01a10e00-0000-7000-8000-00000000dead' as Uuid,
    );
    expect(!inexistente.ok && inexistente.erro.categoria).toBe('nao-encontrado');
    const versao = await proporEAprovar();
    const deNovo = await aprovar.executar(beto, versao.id);
    expect(!deNovo.ok && deNovo.erro.codigo).toBe('versao-ja-aprovada');
  });

  it('lista as versões filtradas', async () => {
    await proporEAprovar();
    await propor.executar(ana, proposta({ ramo: 'penal' }));
    expect((await consultar.versoes({ ramo: 'penal' })).map((v) => v.status)).toEqual(['rascunho']);
    expect(await consultar.versoes({})).toHaveLength(2);
  });
});

describe('resolverPrazo no caso de uso (HU15)', () => {
  it('seleciona pela vigência na data do ato e o texto prevalece', async () => {
    await proporEAprovar({ dias: 7, vigenciaInicio: '2020-01-01' });
    await proporEAprovar({ dias: 9, vigenciaInicio: '2024-03-01' });
    const antes = await resolver.executar({
      tipoAto: 'ato-ficticio',
      ramo: 'civel',
      dataDoAto: '2024-02-29',
    });
    const depois = await resolver.executar({
      tipoAto: 'ato-ficticio',
      ramo: 'civel',
      dataDoAto: '2024-03-01',
    });
    expect(antes.ok && [antes.valor.aplicado?.dias, antes.valor.versaoTabela]).toEqual([7, 1]);
    expect(depois.ok && [depois.valor.aplicado?.dias, depois.valor.versaoTabela]).toEqual([9, 2]);
    const texto = await resolver.executar({
      tipoAto: 'ato-ficticio',
      ramo: 'civel',
      dataDoAto: '2024-03-01',
      prazoNoTexto: { dias: 3, unidade: 'dias' },
    });
    expect(texto.ok && [texto.valor.aplicado, texto.valor.tabela?.dias]).toEqual([
      { dias: 3, unidade: 'dias', origem: 'texto' },
      9,
    ]);
  });

  it('usa a manifestação genérica aprovada; sem ela, a confirmar', async () => {
    const semNada = await resolver.executar({
      tipoAto: 'ato-ficticio',
      ramo: 'civel',
      dataDoAto: '2026-10-06',
    });
    expect(semNada.ok && semNada.valor.avisos).toEqual(['sem-regra-legal-cadastrada']);
    await proporEAprovar({ tipoAto: CODIGO_MANIFESTACAO_GENERICA, dias: 5 });
    const generica = await resolver.executar({
      tipoAto: 'ato-ficticio',
      ramo: 'civel',
      dataDoAto: '2026-10-06',
    });
    expect(generica.ok && generica.valor.avisos).toEqual([
      'ato-sem-tabela-usando-manifestacao-generica',
    ]);
    const propria = await resolver.executar({
      tipoAto: CODIGO_MANIFESTACAO_GENERICA,
      ramo: 'civel',
      dataDoAto: '2026-10-06',
    });
    expect(propria.ok && [propria.valor.aplicado?.dias, propria.valor.avisos]).toEqual([5, []]);
  });

  it('recusa entrada inválida', async () => {
    const r = await resolver.executar({
      tipoAto: 'ato-ficticio',
      ramo: 'eleitoral',
      dataDoAto: 'ontem',
    });
    expect(!r.ok && r.erro.problemas.map((p) => p.campo).sort()).toEqual(['dataDoAto', 'ramo']);
  });
});
