import { FixedClock, Instant, LocalDate, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { BuscarPrazos } from '../application/busca.js';
import { ListarPrazos } from '../application/ciclo-de-vida.js';
import { PainelDosPrazos } from '../application/painel.js';
import { Prazo } from '../domain/prazo.js';

import { PrazosEmMemoria } from './em-memoria.js';

import type { LocalizadorDoProcesso, ProcessoNoCalendario } from '../application/portas.js';
import type { EstadoDoPrazo, StatusDoPrazo } from '../domain/prazo.js';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Dados e calendário FICTÍCIOS (HU26). Hoje: sexta, 2026-10-30, em America/Sao_Paulo.
const relogio = new FixedClock(Instant.deIso('2026-10-30T15:00:00.000Z'));
const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};
const TENANT = '01a10e00-0000-7000-8000-0000000b0001' as Uuid;
const PROCESSO = '01a10e00-0000-7000-8000-0000000b0002' as Uuid;
const ANA = '01a10e00-0000-7000-8000-0000000b0003' as Uuid;
let sequencia = 0;

function prazo(
  vencimento: string | null,
  status: StatusDoPrazo,
  extra: Partial<EstadoDoPrazo> = {},
): Prazo {
  sequencia++;
  return Prazo.restaurar({
    id: `01a10e00-0000-7000-8000-0000000c${String(sequencia).padStart(4, '0')}` as Uuid,
    tenantId: TENANT,
    processoId: PROCESSO,
    publicacaoConteudoId: null,
    tipoAto: 'contestacao',
    ramo: 'civel',
    calculo: {
      situacao: vencimento === null ? 'a-confirmar' : 'calculado',
      dias: 15,
      unidade: 'dias',
      inicio: null,
      vencimento: vencimento === null ? null : d(vencimento),
      fimDoPrazo: null,
      fusoDoJuizo: 'America/Sao_Paulo',
      fundamento: null,
      versaoMotor: 'teste',
      versaoTabela: null,
      memoria: null,
    },
    vencimentoManual: false,
    entrada: null,
    origem: 'manual',
    status,
    statusCiencia: 'pendente',
    responsavelId: null,
    jurisdicao: { tribunal: 'TJGO', lacunas: [] },
    parametros: {},
    classificacaoIncerta: false,
    motivoAjuste: null,
    versaoOtimista: 1,
    ...extra,
  });
}

// Feriado fictício na segunda, 2026-11-02, no calendário do processo.
const processo: ProcessoNoCalendario = {
  ramoDoTribunal: 'estadual',
  jurisdicao: { tribunal: 'TJGO' },
  lacunas: [],
  fuso: { fuso: 'America/Sao_Paulo', outrosFusos: false },
  diasNaoUteis: (inicio, fim) =>
    Promise.resolve(
      [d('2026-11-02')]
        .filter((x) => !x.ehAntesDe(inicio) && !x.ehDepoisDe(fim))
        .map((data) => ({
          data,
          tipo: 'feriado' as const,
          motivo: 'feriado fictício',
          atoNormativo: 'Lei fictícia 1/2000',
          urlAto: 'https://exemplo.invalid/lei',
        })),
    ),
};

async function repositorio(prazos: Prazo[]) {
  const unidade = new OutboxEmMemoria();
  const repo = new PrazosEmMemoria();
  await unidade.executar(async (tx: TransacaoEmMemoria) => {
    for (const p of prazos) await repo.inserir(tx, p);
  });
  return { unidade, repo };
}

async function montar(
  prazos: Prazo[],
  localizar: LocalizadorDoProcesso = () => Promise.resolve(processo),
) {
  const { unidade, repo } = await repositorio(prazos);
  return new PainelDosPrazos(unidade, repo, relogio, localizar);
}

describe('painel dos prazos (HU26)', () => {
  it('conta cada card com a massa conhecida e respeita o recorte', async () => {
    const painel = await montar([
      prazo('2026-10-30', 'pendente'),
      prazo('2026-10-30', 'a-confirmar', { responsavelId: ANA }),
      prazo('2026-10-31', 'pendente', { statusCiencia: 'confirmada' }),
      prazo('2026-11-06', 'pendente'),
      prazo('2026-11-07', 'pendente'),
      prazo('2026-10-20', 'vencido'),
      prazo('2026-10-29', 'pendente'),
      prazo(null, 'a-confirmar'),
      prazo('2026-11-01', 'cumprido'),
      prazo('2026-11-01', 'cancelado'),
      prazo('2026-11-03', 'pendente', { jurisdicao: { tribunal: 'TRT18', lacunas: [] } }),
    ]);
    const tudo = await painel.resumo({});
    expect(tudo.ok && tudo.valor).toEqual({
      vencemHoje: 2,
      proximos7Dias: 3,
      vencidosNaoCumpridos: 2,
      aguardandoConfirmacao: 2,
      semCienciaConfirmada: 7,
    });
    const daAna = await painel.resumo({ responsavelId: ANA });
    expect(daAna.ok && daAna.valor.vencemHoje).toBe(1);
    const trt = await painel.resumo({ tribunal: 'TRT18' });
    expect(trt.ok && trt.valor.proximos7Dias).toBe(1);
    const invalido = await painel.resumo({ responsavelId: 'x' });
    expect(!invalido.ok && invalido.erro.codigo).toBe('validacao');
  });

  it('linha do tempo traz todos os dias da janela, com zero onde nada vence', async () => {
    const painel = await montar([
      prazo('2026-10-30', 'pendente'),
      prazo('2026-11-01', 'pendente'),
      prazo('2026-11-01', 'a-confirmar'),
      prazo('2026-11-05', 'pendente'),
      prazo('2026-11-01', 'cumprido'),
    ]);
    const r = await painel.linhaDoTempo({ dias: '3' });
    if (!r.ok) throw r.erro;
    expect(r.valor.map((x) => [x.data.paraIso(), x.quantidade])).toEqual([
      ['2026-10-30', 1],
      ['2026-10-31', 0],
      ['2026-11-01', 2],
    ]);
    const padrao = await painel.linhaDoTempo({});
    expect(padrao.ok && padrao.valor).toHaveLength(30);
    expect((await painel.linhaDoTempo({ dias: 91 })).ok).toBe(false);
  });

  it('próximos prazos com dias úteis restantes pelo calendário do processo', async () => {
    const painel = await montar([
      prazo('2026-11-04', 'pendente'),
      prazo('2026-10-30', 'a-confirmar'),
      prazo('2026-10-29', 'pendente'),
      prazo('2026-11-03', 'cumprido'),
    ]);
    const r = await painel.proximos({ limite: 5 });
    if (!r.ok) throw r.erro;
    // 30/10 vence hoje: 0. 04/11: sáb, dom e o feriado de 02/11 fora → 03 e 04.
    expect(r.valor.map((p) => [p.vencimento, p.diasUteisRestantes])).toEqual([
      ['2026-10-30', 0],
      ['2026-11-04', 2],
    ]);
  });

  it('sem o processo no calendário, não inventa: dias úteis ficam nulos', async () => {
    const painel = await montar([prazo('2026-11-04', 'pendente')], () =>
      Promise.resolve(undefined),
    );
    const r = await painel.proximos({});
    expect(r.ok && r.valor[0]?.diasUteisRestantes).toBeNull();
    expect((await painel.proximos({ limite: 0 })).ok).toBe(false);
  });

  it('cada card abre a lista com o mesmo critério da contagem', async () => {
    const massa = [
      prazo('2026-10-30', 'pendente'),
      prazo('2026-11-02', 'a-confirmar'),
      prazo('2026-11-07', 'pendente'),
      prazo('2026-10-29', 'pendente'),
      prazo('2026-10-01', 'vencido'),
      prazo('2026-11-03', 'pendente', { statusCiencia: 'confirmada' }),
      prazo('2026-10-30', 'cumprido'),
    ];
    const { unidade, repo } = await repositorio(massa);
    const listar = new ListarPrazos(unidade, repo, relogio);
    const painel = new PainelDosPrazos(unidade, repo, relogio, () => Promise.resolve(undefined));
    const resumo = await painel.resumo({});
    if (!resumo.ok) throw resumo.erro;
    const total = async (recorte: string) => {
      const r = await listar.executar({ recorte, limite: 100 });
      if (!r.ok) throw r.erro;
      return r.valor.itens.length;
    };
    expect(await total('vence-hoje')).toBe(resumo.valor.vencemHoje);
    expect(await total('proximos-7-dias')).toBe(resumo.valor.proximos7Dias);
    expect(await total('vencidos')).toBe(resumo.valor.vencidosNaoCumpridos);
    expect(await total('sem-ciencia')).toBe(resumo.valor.semCienciaConfirmada);
    expect([resumo.valor.vencemHoje, resumo.valor.proximos7Dias]).toEqual([1, 2]);
    expect((await listar.executar({ recorte: 'outro' })).ok).toBe(false);
  });
});

describe('busca avançada em memória (HU28)', () => {
  it('filtra, ordena (sem data por último), pagina e conta com teto', async () => {
    const OUTRO = '01a10e00-0000-7000-8000-0000000b0009' as Uuid;
    const massa = [
      prazo('2026-11-03', 'pendente', { ramo: 'penal', origem: 'djen', responsavelId: ANA }),
      prazo('2026-11-01', 'a-confirmar', { tipoAto: 'recurso', processoId: OUTRO }),
      prazo(null, 'pendente', { statusCiencia: 'confirmada', publicacaoConteudoId: ANA }),
    ];
    const { unidade, repo } = await repositorio(massa);
    const buscar = new BuscarPrazos(unidade, repo);
    const ids = async (f: Partial<Parameters<typeof buscar.executar>[0]>) => {
      const r = await buscar.executar({ campoData: 'vencimento', ordem: 'asc', limite: 10, ...f });
      if (!r.ok) throw r.erro;
      return r.valor.itens.map((p) => massa.findIndex((m) => m.id === p.id));
    };
    expect(await ids({})).toEqual([1, 0, 2]);
    expect(await ids({ ordem: 'desc' })).toEqual([0, 1, 2]);
    expect(await ids({ ramo: 'penal', origem: ['djen'], responsavelIds: [ANA] })).toEqual([0]);
    expect(
      await ids({ tiposAto: ['recurso'], processoIds: [OUTRO], status: ['a-confirmar'] }),
    ).toEqual([1]);
    expect(await ids({ statusCiencia: ['confirmada'], conteudoIds: [ANA] })).toEqual([2]);
    expect(await ids({ de: d('2026-11-02'), ate: d('2026-11-30') })).toEqual([0]);
    expect(await ids({ campoData: 'inicio', de: d('2026-01-01') })).toEqual([]);
    const segundo = massa[1];
    if (segundo === undefined) throw new Error('massa');
    expect(await ids({ depoisDe: segundo.id })).toEqual([0, 2]);
    const pagina = await buscar.executar({ campoData: 'inicio', ordem: 'asc', limite: 1 });
    expect(pagina.ok && pagina.valor).toMatchObject({ totalAproximado: 3, totalLimitado: false });
    expect(pagina.ok && pagina.valor.ultimo?.data).toBeNull();
  });
});

describe('agenda dos lembretes (HU31)', () => {
  it('dias úteis antes do vencimento pelo calendário do processo, com feriado no meio', async () => {
    const { AgendaDosLembretes } = await import('../application/agenda.js');
    const { unidade, repo } = await repositorio([
      prazo('2026-11-04', 'pendente', { responsavelId: ANA }),
    ]);
    const agenda = new AgendaDosLembretes(unidade, repo, () => Promise.resolve(processo));
    const [p] = [
      ...(await unidade.executar((tx) => repo.abertosAPartirDe(tx, d('2026-10-01'), {}, 1))),
    ];
    if (p === undefined) throw new Error('massa');
    expect(await agenda.situacao(p.id)).toMatchObject({ lembrar: true, responsavelId: ANA });
    expect(await agenda.situacao(ANA)).toBeUndefined();
    // Qua 04/11: 1 dia útil antes é ter 03; 2 antes pula o feriado de seg 02 e o fim de semana.
    const datas = await agenda.datas(PROCESSO, d('2026-11-04'), [0, 1, 2]);
    expect(datas.map((x) => [x.antecedencia, x.data.paraIso()])).toEqual([
      [2, '2026-10-30'],
      [1, '2026-11-03'],
      [0, '2026-11-04'],
    ]);
    const semProcesso = new AgendaDosLembretes(unidade, repo, () => Promise.resolve(undefined));
    expect(
      (await semProcesso.datas(PROCESSO, d('2026-11-04'), [5])).map((x) => x.antecedencia),
    ).toEqual([0]);
  });
});
