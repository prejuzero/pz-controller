import { TrilhaPostgres } from '@pz/auditoria';
import {
  AprovarEventoDoCalendario,
  ConsultarDiasNaoUteis,
  EventosGlobaisPostgres,
  FeriadosLocaisPostgres,
  fusoDoJuizo,
  jurisdicaoDoProcesso,
  ProporEventoDoCalendario,
} from '@pz/calendario';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, gerarUuidV7, Instant, LocalDate } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BuscarPrazos } from '../application/busca.js';
import {
  AjustarPrazo,
  ConfirmarPrazo,
  CumprirPrazo,
  ListarPrazos,
  MarcarPrazosVencidos,
} from '../application/ciclo-de-vida.js';
import { PainelDosPrazos } from '../application/painel.js';
import {
  CalcularPrazoParaProcesso,
  CriarPrazo,
  lerAlteracaoDoCalendario,
  RecalcularPrazosPorCalendario,
  TenantsAfetadosPeloCalendario,
} from '../application/prazos.js';
import {
  AprovarVersaoDaTabela,
  CadastrarTipoDeAto,
  ProporVersaoDaTabela,
  ResolverPrazoAplicavel,
} from '../application/tabela-de-prazos.js';
import { ANA, BETO, PLATAFORMA, relogio } from '../teste/ficticios.js';

import { PrazosPostgres } from './prazos-postgres.js';
import { TabelaPostgres, TiposDeAtoPostgres } from './tabela-postgres.js';

import type { LocalizadorDoProcesso } from '../application/portas.js';
import type { PrazoListado } from '../application/prazos.js';
import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Ponta a ponta com banco real (HU16, PZ-143): motor + calendário + tabela + prazo. Tabela,
// portaria e datas FICTÍCIAS (2030): exercitam a ligação, não são regras jurídicas.
// Referência: 05/08/2030 é uma segunda-feira.
const ESCRITORIO = '01a10e00-0000-7000-8000-0000000f0e01' as Uuid;
const OUTRO = '01a10e00-0000-7000-8000-0000000f0e02' as Uuid;
const PROCESSO_GO = '01a10e00-0000-7000-8000-0000000f0c01' as Uuid;
const PROCESSO_OUTRO = '01a10e00-0000-7000-8000-0000000f0c02' as Uuid;
const ana = { ...ANA, canal: 'portal' as const };
const beto = { ...BETO, canal: 'portal' as const };

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
let calcular: CalcularPrazoParaProcesso<Transacao>;
let criar: CriarPrazo<Transacao>;
let recalcular: RecalcularPrazosPorCalendario<Transacao>;
let tenants: TenantsAfetadosPeloCalendario<Transacao>;
let proporEvento: ProporEventoDoCalendario<Transacao>;
let aprovarEvento: AprovarEventoDoCalendario<Transacao>;

const naPlataforma = <T>(trabalho: () => Promise<T>) => executarNoTenant(PLATAFORMA, trabalho);

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar tenants e processos', async (tx) => {
    await tx.tenant.createMany({
      data: [
        { id: PLATAFORMA, nome: 'PrejuZero (fictício)', tipo: 'plataforma' },
        { id: ESCRITORIO, nome: 'Escritório (fictício)', tipo: 'escritorio' },
        { id: OUTRO, nome: 'Outro escritório (fictício)', tipo: 'escritorio' },
      ],
    });
    await tx.processo.createMany({
      data: [
        {
          id: PROCESSO_GO,
          tenantId: ESCRITORIO,
          numeroCnj: '00000010120308090001',
          tribunal: 'TJGO',
          ramo: 'estadual',
          comarca: 'Comarca Fictícia',
        },
        {
          id: PROCESSO_OUTRO,
          tenantId: OUTRO,
          numeroCnj: '00000020120308090001',
          tribunal: 'TJGO',
          ramo: 'estadual',
          comarca: 'Comarca Fictícia',
        },
      ],
    });
  });
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 10 });
  const r = relogio();
  const trilha = new TrilhaPostgres();
  const outbox = new OutboxPostgres();
  const tabela = new TabelaPostgres();
  const tiposDeAto = new TiposDeAtoPostgres();
  const globais = new EventosGlobaisPostgres();
  const dias = new ConsultarDiasNaoUteis(banco, globais, new FeriadosLocaisPostgres());
  // Mesma composição do worker (apps/worker/src/prazos/processo.ts), lendo o processo direto.
  const localizar: LocalizadorDoProcesso = async (processoId) => {
    const p = await banco.executar((tx) => tx.processo.findUnique({ where: { id: processoId } }));
    if (p === null) return undefined;
    const { jurisdicao, lacunas } = jurisdicaoDoProcesso(p);
    return {
      ramoDoTribunal: p.ramo,
      jurisdicao,
      lacunas,
      fuso: fusoDoJuizo(p.tribunal),
      diasNaoUteis: async (inicio, fim) =>
        (await dias.diasNaoUteis(jurisdicao, inicio, fim)).map((d) => ({
          data: d.data,
          tipo: d.tipo,
          motivo: d.motivo,
          atoNormativo: d.fonte.atoNormativo,
          urlAto: d.fonte.urlAto,
        })),
    };
  };
  const prazos = new PrazosPostgres();
  calcular = new CalcularPrazoParaProcesso(localizar, new ResolverPrazoAplicavel(banco, tabela));
  criar = new CriarPrazo(banco, prazos, trilha, outbox, r);
  recalcular = new RecalcularPrazosPorCalendario(banco, prazos, localizar, trilha, outbox, r);
  tenants = new TenantsAfetadosPeloCalendario(sistema.unidade('teste: tenants afetados'), prazos);
  proporEvento = new ProporEventoDoCalendario(banco, globais, trilha, r);
  aprovarEvento = new AprovarEventoDoCalendario(banco, globais, trilha, outbox, r);

  // Tabela FICTÍCIA: 15 dias úteis no cível, aprovada por outra curadora (quatro olhos).
  await naPlataforma(async () => {
    const tipo = await new CadastrarTipoDeAto(banco, tiposDeAto, trilha).executar(ana, {
      codigo: 'ato-ficticio',
      nome: 'Ato fictício',
      descricao: '',
    });
    if (!tipo.ok) throw tipo.erro;
    const proposta = await new ProporVersaoDaTabela(banco, tiposDeAto, tabela, trilha, r).executar(
      ana,
      {
        tipoAto: 'ato-ficticio',
        ramo: 'civel',
        dias: 15,
        unidade: 'dias',
        fundamento: 'FICTÍCIO: Lei de Teste, art. 1º',
        fonteUrl: 'https://exemplo.invalid/ficticio',
        vigenciaInicio: '2020-01-01',
      },
    );
    if (!proposta.ok) throw proposta.erro;
    const aprovacao = await new AprovarVersaoDaTabela(banco, tabela, trilha, outbox, r).executar(
      beto,
      proposta.valor.id,
    );
    if (!aprovacao.ok) throw aprovacao.erro;
  });
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

async function prazoNovo(tenantId: Uuid, processoId: Uuid): Promise<PrazoListado> {
  return executarNoTenant(tenantId, async () => {
    const sugestao = await calcular.executar({
      processoId,
      tipoAto: 'ato-ficticio',
      ramo: 'civel',
      meio: 'djen',
      dataDeReferencia: '2030-08-05',
    });
    if (!sugestao.ok) throw sugestao.erro;
    const r = await criar.executar(
      sugestao.valor,
      { origem: 'djen', responsavelId: null, publicacaoConteudoId: null },
      { tenantId, canal: 'evento' },
    );
    if (!r.ok) throw r.erro;
    return r.valor;
  });
}

/** Evento global aprovado; devolve o CalendarioAlterado gravado no outbox (como o worker recebe). */
async function eventoAprovado(parcial: Record<string, unknown>) {
  return naPlataforma(async () => {
    const p = await proporEvento.executar(ana, {
      tipo: 'feriado',
      inicio: '2030-08-14',
      fim: '2030-08-14',
      descricao: 'FICTÍCIO',
      atoNormativo: 'FICTÍCIO: Portaria de Teste 1/2030',
      urlAto: 'https://exemplo.invalid/portaria',
      ...parcial,
    });
    if (!p.ok) throw p.erro;
    const a = await aprovarEvento.executar(beto, p.valor.id);
    if (!a.ok) throw a.erro;
    const evento = await banco.executar((tx) =>
      tx.eventoDominio.findFirstOrThrow({
        where: { tipo: 'CalendarioAlterado', agregadoId: p.valor.id },
      }),
    );
    return lerAlteracaoDoCalendario(evento);
  });
}

const doTenant = <T>(tenantId: Uuid, trabalho: (tx: Transacao) => Promise<T>) =>
  executarNoTenant(tenantId, () => banco.executar(trabalho));

async function recalcularTodos(alteracao: Awaited<ReturnType<typeof eventoAprovado>>) {
  const alcancados = await tenants.executar(alteracao);
  const lotes = [];
  for (const tenantId of alcancados) {
    lotes.push(await executarNoTenant(tenantId, () => recalcular.executarLote(alteracao, null)));
  }
  return { alcancados, lotes };
}

describe('prazos no PostgreSQL (HU16)', () => {
  it('grava o prazo "a confirmar" com trilha e PrazoSugerido no tenant, isolado por RLS', async () => {
    const prazo = await prazoNovo(ESCRITORIO, PROCESSO_GO);
    expect(prazo).toMatchObject({
      status: 'a-confirmar',
      vencimento: '2030-08-27',
      versaoTabela: 1,
      jurisdicao: { tribunal: 'TJGO', uf: 'GO', comarca: 'Comarca Fictícia' },
    });
    const [auditoria, eventos] = await doTenant(ESCRITORIO, async (tx) => [
      await tx.eventoAuditoria.findMany({ where: { entidadeId: prazo.id } }),
      await tx.eventoDominio.findMany({ where: { agregadoId: prazo.id } }),
    ]);
    expect(auditoria.map((a) => a.tipo)).toEqual(['prazos.prazo-sugerido']);
    expect(eventos.map((e) => [e.tipo, e.tenantId])).toEqual([['PrazoSugerido', ESCRITORIO]]);
    expect(
      await doTenant(OUTRO, (tx) => tx.prazo.findUnique({ where: { id: prazo.id } })),
    ).toBeNull();
    // Sem DELETE para a aplicação: cancelamento é estado.
    await expect(
      doTenant(ESCRITORIO, (tx) => tx.prazo.delete({ where: { id: prazo.id } })),
    ).rejects.toThrow();
  });

  it('portaria nova do TJGO: vencimento muda, trilha antes/depois, PrazoRecalculado; cumprido intacto; sem duplicar', async () => {
    const aberto = await prazoNovo(ESCRITORIO, PROCESSO_GO);
    const cumprido = await prazoNovo(OUTRO, PROCESSO_OUTRO);
    await sistema.executarComoSistema('teste: prazo cumprido', (tx) =>
      tx.prazo.update({ where: { id: cumprido.id }, data: { status: 'cumprido' } }),
    );

    // Portaria de suspensão de prazos (tipo `portaria`), só do TJGO.
    const portaria = await eventoAprovado({
      abrangencia: 'tribunal',
      tribunal: 'TJGO',
      tipo: 'portaria',
    });
    const { alcancados, lotes } = await recalcularTodos(portaria);
    expect(alcancados).toEqual([ESCRITORIO]);
    expect(lotes[0]).toMatchObject({ proximo: null });
    expect(lotes[0]?.vencimentosAlterados).toBeGreaterThanOrEqual(1);

    const [linha, auditoria, eventos] = await doTenant(ESCRITORIO, async (tx) => [
      await tx.prazo.findUniqueOrThrow({ where: { id: aberto.id } }),
      await tx.eventoAuditoria.findMany({
        where: { entidadeId: aberto.id, tipo: 'prazos.prazo-recalculado' },
      }),
      await tx.eventoDominio.findMany({
        where: { agregadoId: aberto.id, tipo: 'PrazoRecalculado' },
      }),
    ]);
    expect(linha.vencimento?.toISOString().slice(0, 10)).toBe('2030-08-28');
    expect(linha.versaoOtimista).toBe(2);
    expect(auditoria).toHaveLength(1);
    expect(eventos.map((e) => e.payload)).toEqual([
      expect.objectContaining({
        vencimentoAnterior: '2030-08-27',
        vencimentoNovo: '2030-08-28',
        eventoCalendarioId: portaria.eventoCalendarioId,
      }),
    ]);
    const intacto = await doTenant(OUTRO, (tx) =>
      tx.prazo.findUniqueOrThrow({ where: { id: cumprido.id } }),
    );
    expect(intacto.vencimento?.toISOString().slice(0, 10)).toBe('2030-08-27');

    // Reprocessar o mesmo evento não duplica trilha nem evento.
    const deNovo = await executarNoTenant(ESCRITORIO, () =>
      recalcular.executarLote(portaria, null),
    );
    expect(deNovo.alterados).toBe(0);
    const depois = await doTenant(ESCRITORIO, (tx) =>
      tx.eventoAuditoria.count({
        where: { entidadeId: aberto.id, tipo: 'prazos.prazo-recalculado' },
      }),
    );
    expect(depois).toBe(1);
  });

  it('feriado de outra UF não alcança nenhum prazo', async () => {
    const antes = await prazoNovo(ESCRITORIO, PROCESSO_GO);
    const outraUf = await eventoAprovado({
      abrangencia: 'uf',
      uf: 'SP',
      inicio: '2030-08-20',
      fim: '2030-08-20',
    });
    const { alcancados, lotes } = await recalcularTodos(outraUf);
    expect(alcancados).toEqual([]);
    expect(lotes).toEqual([]);
    const lote = await executarNoTenant(ESCRITORIO, () => recalcular.executarLote(outraUf, null));
    expect(lote.lidos).toBe(0);
    const linha = await doTenant(ESCRITORIO, (tx) =>
      tx.prazo.findUniqueOrThrow({ where: { id: antes.id } }),
    );
    expect(linha.versaoOtimista).toBe(1);
  });
});

describe('ciclo de vida no PostgreSQL (HU24, PZ-171)', () => {
  const USUARIO = '01a10e00-0000-7000-8000-0000000f0d01' as Uuid;
  const quem = { usuarioId: USUARIO, canal: 'portal' as const };

  it('confirmar → ajustar com motivo → cumprir: trilha de cada passo; 409 na versão velha', async () => {
    const r = relogio();
    const deps = {
      unidade: banco,
      prazos: new PrazosPostgres(),
      trilha: new TrilhaPostgres(),
      outbox: new OutboxPostgres(),
      relogio: r,
    };
    const prazo = await prazoNovo(ESCRITORIO, PROCESSO_GO);
    const noEscritorio = <T>(t: () => Promise<T>) => executarNoTenant(ESCRITORIO, t);
    const c = await noEscritorio(() =>
      new ConfirmarPrazo(deps).executar(quem, prazo.id, { versao: 1 }),
    );
    expect(c.ok && c.valor.status).toBe('pendente');
    const velha = await noEscritorio(() =>
      new ConfirmarPrazo(deps).executar(quem, prazo.id, { versao: 1 }),
    );
    expect(!velha.ok && velha.erro.codigo).toBe('versao-desatualizada');
    const a = await noEscritorio(() =>
      new AjustarPrazo(deps, calcular).executar(quem, prazo.id, {
        versao: 2,
        motivo: 'despacho fixou dez dias',
        dias: 10,
      }),
    );
    expect(a.ok && a.valor).toMatchObject({ dias: 10, vencimentoManual: false, versao: 3 });
    const f = await noEscritorio(() =>
      new CumprirPrazo(deps).executar(quem, prazo.id, { versao: 3 }),
    );
    expect(f.ok && f.valor.status).toBe('cumprido');
    const tipos = await doTenant(ESCRITORIO, (tx) =>
      tx.eventoAuditoria.findMany({
        where: { entidadeId: prazo.id },
        orderBy: { sequencia: 'asc' },
      }),
    );
    expect(tipos.map((t) => t.tipo)).toEqual([
      'prazos.prazo-sugerido',
      'prazos.prazo-confirmado',
      'prazos.prazo-ajustado',
      'prazos.prazo-cumprido',
    ]);
    const lista = await noEscritorio(() =>
      new ListarPrazos(banco, new PrazosPostgres(), relogio()).executar({ status: 'cumprido' }),
    );
    expect(lista.ok && lista.valor.itens.map((i) => i.id)).toContain(prazo.id);
  });

  it('um prazo por publicação no tenant (índice único) e job de vencidos', async () => {
    const prazos = new PrazosPostgres();
    const conteudoId = '01a10e00-0000-7000-8000-0000000f0aaa' as Uuid;
    const prazo = await prazoNovo(ESCRITORIO, PROCESSO_GO);
    await sistema.executarComoSistema('teste: liga o prazo à publicação', (tx) =>
      tx.prazo.update({ where: { id: prazo.id }, data: { publicacaoConteudoId: conteudoId } }),
    );
    expect(await doTenant(ESCRITORIO, (tx) => prazos.existeDaPublicacao(tx, conteudoId))).toBe(
      true,
    );
    expect(await doTenant(OUTRO, (tx) => prazos.existeDaPublicacao(tx, conteudoId))).toBe(false);
    const outro = await prazoNovo(ESCRITORIO, PROCESSO_GO);
    await expect(
      sistema.executarComoSistema('teste: segundo prazo da mesma publicação', (tx) =>
        tx.prazo.update({ where: { id: outro.id }, data: { publicacaoConteudoId: conteudoId } }),
      ),
    ).rejects.toThrow();

    const depois = new FixedClock(Instant.deIso('2031-01-10T07:00:00.000Z'));
    const marcar = new MarcarPrazosVencidos(
      sistema.unidade('teste: vencidos'),
      (tenantId, trabalho) => executarNoTenant(tenantId, trabalho),
      {
        unidade: banco,
        prazos,
        trilha: new TrilhaPostgres(),
        outbox: new OutboxPostgres(),
        relogio: depois,
      },
    );
    const resultado = await marcar.executar();
    expect(resultado.vencidos).toBeGreaterThanOrEqual(2);
    const linha = await doTenant(ESCRITORIO, (tx) =>
      tx.prazo.findUniqueOrThrow({ where: { id: outro.id } }),
    );
    expect(linha.status).toBe('vencido');
    expect((await marcar.executar()).vencidos).toBe(0);
  });
});

describe('dashboard no PostgreSQL (HU26, PZ-176)', () => {
  const PAINEL = '01a10e00-0000-7000-8000-0000000f0e03' as Uuid;
  const PROCESSO_PAINEL = '01a10e00-0000-7000-8000-0000000f0c03' as Uuid;
  // Hoje: 2030-09-02 (segunda) em America/Sao_Paulo.
  const hoje = new FixedClock(Instant.deIso('2030-09-02T15:00:00.000Z'));
  const semCalendario: LocalizadorDoProcesso = () => Promise.resolve(undefined);
  const linha = (
    vencimento: string | null,
    status: string,
    extra: Record<string, unknown> = {},
  ) => ({
    id: gerarUuidV7(hoje),
    tenantId: PAINEL,
    processoId: PROCESSO_PAINEL,
    tipoAto: 'ato-ficticio',
    vencimento: vencimento === null ? null : new Date(`${vencimento}T00:00:00.000Z`),
    memoriaCalculo: {},
    origem: 'manual' as const,
    status: status as 'pendente',
    jurisdicao: { tribunal: 'TJGO', lacunas: [] },
    ...extra,
  });

  beforeAll(async () => {
    await sistema.executarComoSistema('preparar o escritório do dashboard', async (tx) => {
      await tx.tenant.create({
        data: { id: PAINEL, nome: 'Escritório do painel (fictício)', tipo: 'escritorio' },
      });
      await tx.processo.create({
        data: {
          id: PROCESSO_PAINEL,
          tenantId: PAINEL,
          numeroCnj: '00000030120308090001',
          tribunal: 'TJGO',
          ramo: 'estadual',
        },
      });
      await tx.prazo.createMany({
        data: [
          linha('2030-09-02', 'pendente'),
          linha('2030-09-02', 'a_confirmar'),
          linha('2030-09-05', 'pendente', { statusCiencia: 'confirmada' }),
          linha('2030-09-09', 'pendente'),
          linha('2030-09-10', 'pendente'),
          linha('2030-08-20', 'vencido'),
          linha('2030-08-30', 'pendente'),
          linha(null, 'a_confirmar'),
          linha('2030-09-03', 'cumprido'),
          linha('2030-09-03', 'pendente', { jurisdicao: { tribunal: 'TRT18', lacunas: [] } }),
        ],
      });
    });
  });

  it('conta os cards na massa conhecida, isolado por RLS, e filtra por tribunal', async () => {
    const painel = new PainelDosPrazos(banco, new PrazosPostgres(), hoje, semCalendario);
    const r = await executarNoTenant(PAINEL, () => painel.resumo({}));
    expect(r.ok && r.valor).toEqual({
      vencemHoje: 2,
      proximos7Dias: 3,
      vencidosNaoCumpridos: 2,
      aguardandoConfirmacao: 2,
      semCienciaConfirmada: 7,
    });
    const trt = await executarNoTenant(PAINEL, () => painel.resumo({ tribunal: 'TRT18' }));
    expect(trt.ok && trt.valor.proximos7Dias).toBe(1);
    const linhaDoTempo = await executarNoTenant(PAINEL, () => painel.linhaDoTempo({ dias: 2 }));
    expect(linhaDoTempo.ok && linhaDoTempo.valor.map((d) => d.quantidade)).toEqual([2, 1]);
    const proximos = await executarNoTenant(PAINEL, () => painel.proximos({ limite: 3 }));
    expect(proximos.ok && proximos.valor.map((p) => p.vencimento)).toEqual([
      '2030-09-02',
      '2030-09-02',
      '2030-09-03',
    ]);
    const doOutro = await executarNoTenant(OUTRO, () => painel.proximos({ limite: 50 }));
    expect(doOutro.ok && doOutro.valor.every((p) => p.processoId !== PROCESSO_PAINEL)).toBe(true);
  });

  it('resumo com 5.000 prazos responde em p95 abaixo de 300 ms', async () => {
    await sistema.executarComoSistema('massa de 5.000 prazos', (tx) =>
      tx.prazo.createMany({
        data: Array.from({ length: 5000 }, (_, i) =>
          linha(
            `2030-${String(9 + (i % 4)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
            i % 3 === 0 ? 'a_confirmar' : 'pendente',
          ),
        ),
      }),
    );
    const painel = new PainelDosPrazos(banco, new PrazosPostgres(), hoje, semCalendario);
    const tempos: number[] = [];
    for (let i = 0; i < 20; i++) {
      const inicio = performance.now();
      const r = await executarNoTenant(PAINEL, () => painel.resumo({}));
      tempos.push(performance.now() - inicio);
      expect(r.ok).toBe(true);
    }
    tempos.sort((a, b) => a - b);
    expect(tempos[Math.ceil(tempos.length * 0.95) - 1]).toBeLessThan(300);
  });
});

describe('busca avançada no PostgreSQL (HU28, PZ-183)', () => {
  const BUSCA = '01a10e00-0000-7000-8000-0000000f0e04' as Uuid;
  const PROC_A = '01a10e00-0000-7000-8000-0000000f0c04' as Uuid;
  const PROC_B = '01a10e00-0000-7000-8000-0000000f0c05' as Uuid;
  const CONTEUDO = '01a10e00-0000-7000-8000-0000000f0aa4' as Uuid;
  const r = new FixedClock(Instant.deIso('2030-09-02T15:00:00.000Z'));
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const data = (iso: string) => {
    const l = LocalDate.analisar(iso);
    if (!l.ok) throw l.erro;
    return l.valor;
  };
  const ids: Uuid[] = [];

  beforeAll(async () => {
    const linha = (i: number, extra: Record<string, unknown>) => {
      const id = gerarUuidV7(r);
      ids.push(id);
      return {
        id,
        tenantId: BUSCA,
        processoId: PROC_A,
        tipoAto: 'contestacao',
        memoriaCalculo: {},
        origem: 'djen' as const,
        status: 'pendente' as const,
        jurisdicao: { tribunal: 'TJGO', lacunas: [] },
        vencimento: d(`2030-09-${String(10 + i).padStart(2, '0')}`),
        inicio: d(`2030-09-0${String(1 + i)}`),
        ...extra,
      };
    };
    await sistema.executarComoSistema('preparar o escritório da busca', async (tx) => {
      await tx.tenant.create({ data: { id: BUSCA, nome: 'Busca (fictício)', tipo: 'escritorio' } });
      await tx.processo.createMany({
        data: [
          { id: PROC_A, tenantId: BUSCA, numeroCnj: '00000040120308090001', tribunal: 'TJGO' },
          { id: PROC_B, tenantId: BUSCA, numeroCnj: '00000050120308090001', tribunal: 'TJGO' },
        ],
      });
      await tx.prazo.createMany({
        data: [
          linha(0, { ramo: 'civel', publicacaoConteudoId: CONTEUDO }),
          linha(1, { tipoAto: 'recurso', status: 'a_confirmar', statusCiencia: 'confirmada' }),
          linha(2, { processoId: PROC_B, origem: 'manual', responsavelId: ANA.usuarioId }),
          linha(3, { status: 'a_confirmar', vencimento: null }),
        ],
      });
    });
  });

  const buscar = (filtro: Partial<Parameters<BuscarPrazos<Transacao>['executar']>[0]>) =>
    executarNoTenant(BUSCA, async () => {
      const resultado = await new BuscarPrazos(banco, new PrazosPostgres()).executar({
        campoData: 'vencimento',
        ordem: 'asc',
        limite: 10,
        ...filtro,
      });
      if (!resultado.ok) throw resultado.erro;
      return resultado.valor;
    });
  const quais = async (filtro: Parameters<typeof buscar>[0]) =>
    (await buscar(filtro)).itens.map((p) => ids.indexOf(p.id));

  it('cada campo isolado e combinados com E', async () => {
    expect(await quais({})).toEqual([0, 1, 2, 3]);
    expect(await quais({ processoIds: [PROC_B] })).toEqual([2]);
    expect(await quais({ conteudoIds: [CONTEUDO] })).toEqual([0]);
    expect(await quais({ responsavelIds: [ANA.usuarioId] })).toEqual([2]);
    expect(await quais({ tiposAto: ['recurso'] })).toEqual([1]);
    expect(await quais({ status: ['pendente'] })).toEqual([0, 2]);
    expect(await quais({ statusCiencia: ['confirmada'] })).toEqual([1]);
    expect(await quais({ ramo: 'civel' })).toEqual([0]);
    expect(await quais({ origem: ['manual'] })).toEqual([2]);
    expect(await quais({ de: data('2030-09-11'), ate: data('2030-09-12') })).toEqual([1, 2]);
    expect(await quais({ campoData: 'inicio', de: data('2030-09-03') })).toEqual([2, 3]);
    expect(await quais({ status: ['pendente'], origem: ['djen'] })).toEqual([0]);
    expect(await quais({ processoIds: [] })).toEqual([]);
    // Sem data vai por último nas duas ordens.
    expect(await quais({ ordem: 'desc' })).toEqual([2, 1, 0, 3]);
  });

  it('pagina por cursor e conta o total; outro tenant não vê nada', async () => {
    const primeira = await buscar({ limite: 2 });
    expect(primeira).toMatchObject({ totalAproximado: 4, totalLimitado: false });
    expect(primeira.ultimo?.id).toBe(ids[1]);
    const segundo = ids[1];
    if (segundo === undefined) throw new Error('massa');
    expect(await quais({ limite: 2, depoisDe: segundo })).toEqual([2, 3]);
    const doOutro = await executarNoTenant(OUTRO, () =>
      new BuscarPrazos(banco, new PrazosPostgres()).executar({
        processoIds: [PROC_A],
        campoData: 'vencimento',
        ordem: 'asc',
        limite: 10,
      }),
    );
    expect(doOutro.ok && doOutro.valor.itens).toEqual([]);
  });
});
