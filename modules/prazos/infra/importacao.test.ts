import { OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import { COLUNAS_DA_TABELA, ImportarTabelaDePrazos } from '../application/importacao.js';
import {
  CadastrarTipoDeAto,
  ConsultarTabelaDePrazos,
  ProporVersaoDaTabela,
} from '../application/tabela-de-prazos.js';
import { ANA, relogio } from '../teste/ficticios.js';

import { TabelaEmMemoria } from './em-memoria.js';

import type { CuradorEmAcao } from '../application/tabela-de-prazos.js';
import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria } from '@pz/kernel';

class TrilhaFalsa implements TrilhaDeAuditoria<TransacaoEmMemoria> {
  readonly tipos: string[] = [];
  registrar(transacao: TransacaoEmMemoria, entrada: EntradaDeAuditoria) {
    transacao.aoConfirmar(() => this.tipos.push(entrada.tipo));
    return Promise.resolve();
  }
}

// Linhas FICTÍCIAS: só exercitam o mecanismo, sem regra jurídica real.
const CABECALHO = COLUNAS_DA_TABELA.join(';');
const CIVEL =
  'ato-a;FICTÍCIO Ato A;civel;15;dias;;entes-cpc;automatico;;orgao-do-processo;;FICTÍCIO: Lei 1, art. 1º;https://exemplo.invalid/a;2016-03-18;';
const PENAL =
  'ato-a;;juizado-criminal;10;dias;corridos;so-defensoria;data-informada;citação;;"Conferir; com cuidado";FICTÍCIO: Lei 2, art. 2º;https://exemplo.invalid/b;1995-11-26;';

const ana: CuradorEmAcao = { ...ANA, canal: 'portal' };
let repositorio: TabelaEmMemoria;
let trilha: TrilhaFalsa;
let importar: ImportarTabelaDePrazos<TransacaoEmMemoria>;
let consultar: ConsultarTabelaDePrazos<TransacaoEmMemoria>;

beforeEach(() => {
  const outbox = new OutboxEmMemoria();
  repositorio = new TabelaEmMemoria();
  trilha = new TrilhaFalsa();
  importar = new ImportarTabelaDePrazos(outbox, repositorio, repositorio, trilha, relogio());
  consultar = new ConsultarTabelaDePrazos(outbox, repositorio, repositorio);
});

const csv = (...linhas: string[]) => [CABECALHO, ...linhas].join('\n');

describe('ImportarTabelaDePrazos (HU15)', () => {
  it('prévia: valida, aponta os tipos novos e não grava nada', async () => {
    const r = await importar.executar(ana, { csv: csv(CIVEL, PENAL) });
    expect(r.ok && r.valor).toEqual({
      linhas: [
        { linha: 2, problemas: [] },
        { linha: 3, problemas: [] },
      ],
      tiposNovos: ['ato-a'],
      propostos: [],
    });
    expect(await consultar.versoes({})).toEqual([]);
    expect(trilha.tipos).toEqual([]);
  });

  it('grava os tipos novos e as versões como rascunho, com auditoria', async () => {
    const r = await importar.executar(ana, { csv: csv(CIVEL, PENAL), somentePrevia: false });
    if (!r.ok) throw r.erro;
    expect(r.valor.propostos.map((v) => [v.ramo, v.status, v.versao, v.contagem])).toEqual([
      ['civel', 'rascunho', 1, 'uteis'],
      ['juizado-criminal', 'rascunho', 1, 'corridos'],
    ]);
    expect(r.valor.propostos[1]).toMatchObject({
      politicaDobro: 'so-defensoria',
      calculo: 'data-informada',
      marcoInicial: 'citação',
      alerta: 'Conferir; com cuidado',
      localDoAto: null,
    });
    expect((await consultar.tiposDeAto()).map((t) => [t.codigo, t.nome])).toEqual([
      ['ato-a', 'FICTÍCIO Ato A'],
    ]);
    expect(trilha.tipos).toEqual([
      'prazos.tipo-de-ato-cadastrado',
      'prazos.versao-da-tabela-proposta',
      'prazos.versao-da-tabela-proposta',
    ]);
  });

  it('nova versão quando o ato e o ramo já existem', async () => {
    await importar.executar(ana, { csv: csv(CIVEL), somentePrevia: false });
    const r = await importar.executar(ana, { csv: csv(CIVEL), somentePrevia: false });
    if (!r.ok) throw r.erro;
    expect(r.valor.tiposNovos).toEqual([]);
    expect(r.valor.propostos[0]?.versao).toBe(2);
  });

  it('tudo ou nada: uma linha com problema impede a gravação', async () => {
    const r = await importar.executar(ana, {
      csv: csv(
        CIVEL,
        'ato-b;;civel;0;dias;;;;;;;;http://exemplo.invalid;2020-01-01;2019-01-01',
        CIVEL,
        'ato-c;FICTÍCIO;civel;5;dias;;;;;;;FICTÍCIO;https://exemplo.invalid/c;2020-01-01;2019-01-01',
        `${CIVEL};extra`,
      ),
      somentePrevia: false,
    });
    if (!r.ok) throw r.erro;
    const campos = r.valor.linhas.map((l) => l.problemas.map((p) => p.campo));
    expect(campos[0]).toEqual([]);
    expect(campos[1]).toEqual(expect.arrayContaining(['dias', 'fonteUrl']));
    expect(campos[2]).toEqual(['tipoAto']);
    expect(campos[3]).toEqual(['vigenciaFim']);
    expect(campos[4]).toEqual(expect.arrayContaining(['csv', 'tipoAto']));
    expect(r.valor.propostos).toEqual([]);
    expect(await consultar.versoes({})).toEqual([]);
  });

  it('tipo novo sem nome é problema da linha', async () => {
    const semNome = CIVEL.replace('FICTÍCIO Ato A', '');
    const r = await importar.executar(ana, { csv: csv(semNome) });
    expect(r.ok && r.valor.linhas).toEqual([
      {
        linha: 2,
        problemas: [{ campo: 'nomeDoAto', mensagem: 'Tipo de ato novo: informe o nome.' }],
      },
    ]);
  });

  it('recusa entrada, cabeçalho e tamanho inválidos', async () => {
    expect((await importar.executar(ana, {})).ok).toBe(false);
    expect((await importar.executar(ana, { csv: 'a;b\n1;2' })).ok).toBe(false);
    expect((await importar.executar(ana, { csv: CABECALHO })).ok).toBe(false);
  });

  it('a proposta individual também aceita os campos novos e usa a contagem do ramo', async () => {
    const outbox = new OutboxEmMemoria();
    await new CadastrarTipoDeAto(outbox, repositorio, trilha).executar(ana, {
      codigo: 'ato-x',
      nome: 'FICTÍCIO',
      descricao: '',
    });
    const propor = new ProporVersaoDaTabela(outbox, repositorio, repositorio, trilha, relogio());
    const r = await propor.executar(ana, {
      tipoAto: 'ato-x',
      ramo: 'penal',
      dias: 5,
      unidade: 'dias',
      fundamento: 'FICTÍCIO',
      fonteUrl: 'https://exemplo.invalid/x',
      vigenciaInicio: '2020-01-01',
    });
    expect(r.ok && [r.valor.contagem, r.valor.politicaDobro, r.valor.calculo]).toEqual([
      'corridos',
      'verificar',
      'automatico',
    ]);
  });
});

describe('arquivo de carga da curadoria V2 (docs/curadoria/carga)', () => {
  it('passa na prévia sem problemas', async () => {
    const { readFileSync } = await import('node:fs');
    const arquivo = new URL('../../../docs/curadoria/carga/tabela-de-prazos.csv', import.meta.url);
    const r = await importar.executar(ana, { csv: readFileSync(arquivo, 'utf8') });
    if (!r.ok) throw r.erro;
    expect(r.valor.linhas.filter((l) => l.problemas.length > 0)).toEqual([]);
    expect(r.valor.linhas).toHaveLength(83);
  });
});
