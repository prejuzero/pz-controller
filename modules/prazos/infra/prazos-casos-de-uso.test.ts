import { LocalDate, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CalcularPrazoParaProcesso,
  CriarPrazo,
  lerAlteracaoDoCalendario,
  RecalcularPrazosPorCalendario,
  SugestaoDePrazo,
  TenantsAfetadosPeloCalendario,
} from '../application/prazos.js';
import { ResolverPrazoAplicavel } from '../application/tabela-de-prazos.js';
import { Prazo } from '../domain/prazo.js';
import { aprovada, relogio } from '../teste/ficticios.js';

import { PrazosEmMemoria, TabelaEmMemoria } from './em-memoria.js';

import type { DiaDoCalendario, ProcessoNoCalendario } from '../application/portas.js';
import type { AutorDoPrazo } from '../application/prazos.js';
import type { StatusDoPrazo } from '../domain/prazo.js';
import type { ConteudoDaVersao } from '../domain/tabela.js';
import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Calendário, tabela e processos FICTÍCIOS: exercitam a ligação motor + calendário + tabela, não
// regras jurídicas (essas estão nos casos assinados pela curadora, em packages/motor-prazos).
// Referência: 01/03/2027 é uma segunda-feira.

class TrilhaFalsa implements TrilhaDeAuditoria<TransacaoEmMemoria> {
  readonly registros: EntradaDeAuditoria[] = [];
  registrar(transacao: TransacaoEmMemoria, entrada: EntradaDeAuditoria) {
    transacao.aoConfirmar(() => this.registros.push(entrada));
    return Promise.resolve();
  }
}

const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};
const TENANT = '01a10e00-0000-7000-8000-00000000a001' as Uuid;
const OUTRO_TENANT = '01a10e00-0000-7000-8000-00000000b001' as Uuid;
const PROCESSO = '01a10e00-0000-7000-8000-00000000c001' as Uuid;
const PROCESSO_TRT = '01a10e00-0000-7000-8000-00000000c002' as Uuid;
const EVENTO = '01a10e00-0000-7000-8000-00000000e001' as Uuid;
const autor: AutorDoPrazo = { tenantId: TENANT, canal: 'evento' };

const feriado = (iso: string): DiaDoCalendario => ({
  data: d(iso),
  tipo: 'feriado',
  motivo: 'feriado FICTÍCIO',
  atoNormativo: 'Ato FICTÍCIO 1/2027',
  urlAto: 'https://exemplo.invalid/ato',
});

let dias: DiaDoCalendario[];
let consultas: { inicio: string; fim: string }[];
let fuso: ProcessoNoCalendario['fuso'];
let outbox: OutboxEmMemoria;
let tabela: TabelaEmMemoria;
let prazos: PrazosEmMemoria;
let trilha: TrilhaFalsa;
let calcular: CalcularPrazoParaProcesso<TransacaoEmMemoria>;
let criar: CriarPrazo<TransacaoEmMemoria>;
let recalcular: RecalcularPrazosPorCalendario<TransacaoEmMemoria>;

const processoNoCalendario = (ramoDoTribunal: string): ProcessoNoCalendario => ({
  ramoDoTribunal,
  jurisdicao: { tribunal: 'TJXA', uf: 'XA', comarca: 'Comarca Fictícia' },
  lacunas: ['municipio'],
  fuso,
  diasNaoUteis: (inicio, fim) => {
    consultas.push({ inicio: inicio.paraIso(), fim: fim.paraIso() });
    return Promise.resolve(
      dias.filter((x) => !x.data.ehAntesDe(inicio) && !x.data.ehDepoisDe(fim)),
    );
  },
});
const localizar = (id: Uuid) =>
  Promise.resolve(
    id === PROCESSO
      ? processoNoCalendario('estadual')
      : id === PROCESSO_TRT
        ? processoNoCalendario('trabalho')
        : undefined,
  );

const entrada = (parcial: Record<string, unknown> = {}) => ({
  processoId: PROCESSO,
  tipoAto: 'ato-ficticio',
  ramo: 'civel',
  meio: 'djen',
  dataDeReferencia: '2027-03-01',
  ...parcial,
});

async function sugerir(parcial: Record<string, unknown> = {}) {
  const r = await calcular.executar(entrada(parcial));
  if (!r.ok) throw r.erro;
  return r.valor;
}

async function criado(parcial: Record<string, unknown> = {}) {
  const r = await criar.executar(
    await sugerir(parcial),
    { origem: 'djen', responsavelId: null, publicacaoConteudoId: null },
    autor,
  );
  if (!r.ok) throw r.erro;
  return r.valor;
}

/** Grava um prazo já existente com outro status ou tenant (como o advogado o deixou). */
async function comEstado(
  id: Uuid,
  status: StatusDoPrazo,
  extra: { tenantId?: Uuid; vencimentoManual?: boolean } = {},
) {
  const atual = await outbox.executar((tx) => prazos.buscar(tx, id));
  if (atual === undefined) throw new Error('prazo inexistente');
  const novo = Prazo.restaurar({
    ...atual.estado,
    status,
    ...extra,
    id: `${id.slice(0, -4)}ffff` as Uuid,
  });
  await outbox.executar((tx) => prazos.inserir(tx, novo));
  return novo.id;
}

const eventosNoOutbox = () => outbox.executar((tx) => outbox.reservarPendentes(tx, 100));

const alteracao = (payload: Record<string, unknown> = {}) =>
  lerAlteracaoDoCalendario({
    id: '01a10e00-0000-7000-8000-00000000e0ff',
    tenantId: TENANT,
    payload: {
      eventoId: EVENTO,
      origem: 'global',
      abrangencia: 'nacional',
      inicio: '2027-03-10',
      fim: '2027-03-10',
      ...payload,
    },
  });

async function aprovar(parcial: Partial<ConteudoDaVersao> = {}) {
  const versao = aprovada(parcial);
  const codigo = versao.estado.tipoAto;
  await outbox.executar(async (tx) => {
    if (!(await tabela.existe(tx, codigo))) {
      await tabela.inserir(tx, {
        codigo,
        nome: `FICTÍCIO ${codigo}`,
        descricao: '',
        sinonimos: [],
      });
    }
  });
  await outbox.executar((tx) => tabela.inserir(tx, versao));
}

beforeEach(async () => {
  dias = [];
  consultas = [];
  fuso = { fuso: 'America/Sao_Paulo', outrosFusos: false };
  outbox = new OutboxEmMemoria();
  tabela = new TabelaEmMemoria();
  prazos = new PrazosEmMemoria();
  trilha = new TrilhaFalsa();
  const r = relogio();
  calcular = new CalcularPrazoParaProcesso(localizar, new ResolverPrazoAplicavel(outbox, tabela));
  criar = new CriarPrazo(outbox, prazos, trilha, outbox, r);
  recalcular = new RecalcularPrazosPorCalendario(outbox, prazos, localizar, trilha, outbox, r);
  // FICTÍCIO: 15 dias úteis, cível.
  await aprovar({ dias: 15 });
});

describe('cálculo do prazo para o processo (HU16, PZ-141)', () => {
  it('sugere pelo motor com a tabela e o calendário, e grava "a confirmar" com trilha e evento', async () => {
    // DJEN: disponibilizado na segunda 01/03, publicado na terça 02/03, conta da quarta 03/03.
    const sugestao = await sugerir();
    expect(sugestao.calculo).toMatchObject({ situacao: 'calculado', dias: 15, versaoTabela: 1 });
    expect(sugestao.calculo.vencimento?.paraIso()).toBe('2027-03-23');
    expect(sugestao.resolucao?.aplicado).toMatchObject({ origem: 'tabela', dias: 15 });

    const prazo = await criado();
    expect(prazo).toMatchObject({
      status: 'a-confirmar',
      statusCiencia: 'pendente',
      vencimento: '2027-03-23',
      fusoDoJuizo: 'America/Sao_Paulo',
      fimDoPrazo: '2027-03-24T03:00:00.000Z',
      jurisdicao: {
        tribunal: 'TJXA',
        uf: 'XA',
        comarca: 'Comarca Fictícia',
        lacunas: ['municipio'],
      },
    });
    expect(trilha.registros.map((r) => r.tipo)).toEqual(['prazos.prazo-sugerido']);
    const eventos = await eventosNoOutbox();
    expect(eventos.map((e) => [e.tipo, e.payload])).toEqual([
      [
        'PrazoSugerido',
        {
          prazoId: prazo.id,
          processoId: PROCESSO,
          tipoAto: 'ato-ficticio',
          origem: 'djen',
          situacao: 'calculado',
          vencimento: '2027-03-23',
        },
      ],
    ]);
  });

  it('desconsidera o feriado do calendário e avisa do feriado municipal não verificado', async () => {
    dias = [feriado('2027-03-10')];
    const { calculo } = await sugerir();
    expect(calculo.vencimento?.paraIso()).toBe('2027-03-24');
    expect(JSON.stringify(calculo.memoria)).toContain('Feriado local não verificado');
  });

  it('dobra a janela do calendário até cobrir o vencimento', async () => {
    await aprovar({ tipoAto: 'ato-longo', dias: 200 });
    const sem = await sugerir({ tipoAto: 'ato-longo' });
    expect(consultas.length).toBeGreaterThan(1);
    const vencimento = sem.calculo.vencimento;
    if (vencimento === null) throw new Error('sem vencimento');
    dias = [feriado(vencimento.maisDias(-1).paraIso())];
    consultas = [];
    const com = await sugerir({ tipoAto: 'ato-longo' });
    expect(com.calculo.vencimento?.ehDepoisDe(vencimento)).toBe(true);
    expect(consultas.at(-1)?.fim.localeCompare(vencimento.paraIso())).toBeGreaterThan(0);
  });

  it('avisa quando o tribunal tem unidades em outro fuso', async () => {
    fuso = { fuso: 'America/Manaus', outrosFusos: true };
    const { calculo } = await sugerir();
    expect(calculo.fusoDoJuizo).toBe('America/Manaus');
    expect(JSON.stringify(calculo.memoria)).toContain('unidades em mais de um fuso');
  });

  it('sem ramo, só deduz o trabalhista; nos outros fica "a confirmar"', async () => {
    const civel = await sugerir({ ramo: undefined });
    expect(civel.ramo).toBeNull();
    expect(civel.calculo).toMatchObject({ situacao: 'a-confirmar', vencimento: null });
    expect(civel.calculo.memoria).toMatchObject({ motivo: 'dados-insuficientes' });
    expect(civel.entrada).toBeNull();

    await aprovar({ ramo: 'trabalhista', dias: 8 });
    const trabalhista = await sugerir({ ramo: undefined, processoId: PROCESSO_TRT });
    expect(trabalhista.ramo).toBe('trabalhista');
    expect(trabalhista.calculo.situacao).toBe('calculado');
  });

  it('ato sem tabela nem manifestação genérica fica "a confirmar" sem regra legal', async () => {
    const { calculo, resolucao } = await sugerir({ tipoAto: 'ato-sem-tabela' });
    expect(resolucao?.avisos).toEqual(['sem-regra-legal-cadastrada']);
    expect(calculo).toMatchObject({ situacao: 'a-confirmar', fundamento: null });
    expect(calculo.memoria).toMatchObject({ motivo: 'sem-regra-legal' });
  });

  it('prazo só do texto: conta como o ramo e não dobra sozinho', async () => {
    const { calculo, entrada: gravada } = await sugerir({
      tipoAto: 'ato-sem-tabela',
      prazoNoTexto: { dias: 5, unidade: 'dias' },
    });
    expect(calculo).toMatchObject({ situacao: 'calculado', dias: 5, versaoTabela: null });
    expect(gravada).toMatchObject({
      prazo: { contagem: 'uteis', dobro: 'verificar', versao: 'sem-tabela' },
    });
  });

  it('linha da tabela com data informada pelo advogado fica "a confirmar" com o marco', async () => {
    await aprovar({ tipoAto: 'ato-com-marco', calculo: 'data-informada', marcoInicial: 'citação' });
    const { calculo } = await sugerir({ tipoAto: 'ato-com-marco' });
    expect(calculo).toMatchObject({ situacao: 'a-confirmar', dias: 7, versaoTabela: 1 });
    expect(calculo.memoria).toMatchObject({
      detalhe: expect.stringContaining('marco: citação') as string,
    });

    await aprovar({ tipoAto: 'ato-sem-calculo', calculo: 'nao-calcula' });
    const sem = await sugerir({ tipoAto: 'ato-sem-calculo' });
    expect(sem.calculo.memoria).toMatchObject({
      detalhe: expect.stringContaining('não prevê') as string,
    });
  });

  it('unidade sem regra de contagem fica "a confirmar" pelo motor', async () => {
    const { calculo } = await sugerir({
      tipoAto: 'ato-sem-tabela',
      prazoNoTexto: { dias: 48, unidade: 'horas' },
    });
    expect(calculo).toMatchObject({ situacao: 'a-confirmar', dias: 48, unidade: 'horas' });
    expect(calculo.memoria).toMatchObject({ motivo: 'unidade-sem-regra' });
  });

  it('recusa processo de outro tenant, entrada inválida e sugestão que não veio do motor', async () => {
    const outro = await calcular.executar(entrada({ processoId: OUTRO_TENANT }));
    expect(!outro.ok && outro.erro.codigo).toBe('processo-inexistente');
    const invalida = await calcular.executar(entrada({ dataDeReferencia: '01/03/2027' }));
    expect(!invalida.ok && invalida.erro.codigo).toBe('validacao');
    const sugestao = await sugerir();
    // Mesmos campos, sem ter passado pelo cálculo (a checagem é em tempo de execução).
    const forjada = Object.assign<object, SugestaoDePrazo>({}, sugestao);
    const r = await criar.executar(
      forjada,
      { origem: 'manual', responsavelId: null, publicacaoConteudoId: null },
      autor,
    );
    expect(!r.ok && r.erro.codigo).toBe('validacao');
    expect(SugestaoDePrazo.ehValida(sugestao)).toBe(true);
  });
});

describe('recálculo por mudança de calendário (HU16, PZ-142)', () => {
  it('feriado novo no intervalo: vencimento muda, volta a "a confirmar", trilha e evento', async () => {
    const prazo = await criado();
    const confirmado = await comEstado(prazo.id, 'pendente');
    await eventosNoOutbox();
    dias = [feriado('2027-03-10')];

    const lote = await recalcular.executarLote(alteracao(), null);
    expect(lote).toMatchObject({ lidos: 2, alterados: 2, vencimentosAlterados: 2, proximo: null });
    const depois = await outbox.executar((tx) => prazos.buscar(tx, confirmado));
    expect(depois?.estado.status).toBe('a-confirmar');
    expect(depois?.estado.calculo.vencimento?.paraIso()).toBe('2027-03-24');
    expect(depois?.estado.versaoOtimista).toBe(2);
    const registro = trilha.registros.find(
      (r) => r.tipo === 'prazos.prazo-recalculado' && r.entidadeId === confirmado,
    );
    expect(registro?.antes).toMatchObject({ vencimento: '2027-03-23', status: 'pendente' });
    expect(registro?.depois).toMatchObject({
      vencimento: '2027-03-24',
      status: 'a-confirmar',
      motivo: 'calendario-alterado',
      eventoCalendarioId: EVENTO,
    });
    const eventos = await eventosNoOutbox();
    expect(eventos.find((e) => e.agregadoId === confirmado)?.payload).toEqual({
      prazoId: confirmado,
      processoId: PROCESSO,
      vencimentoAnterior: '2027-03-23',
      vencimentoNovo: '2027-03-24',
      statusAnterior: 'pendente',
      eventoCalendarioId: EVENTO,
    });
  });

  it('reprocessar o mesmo evento não muda nada', async () => {
    await criado();
    dias = [feriado('2027-03-10')];
    await recalcular.executarLote(alteracao(), null);
    trilha.registros.length = 0;
    const eventosAntes = outbox.pendentes().length;
    const deNovo = await recalcular.executarLote(alteracao(), null);
    expect(deNovo).toMatchObject({ lidos: 1, alterados: 0 });
    expect(trilha.registros).toEqual([]);
    expect(outbox.pendentes()).toHaveLength(eventosAntes);
  });

  it('prazo cumprido, cancelado ou com data manual fica intacto', async () => {
    const prazo = await criado();
    await outbox.executar(async (tx) => {
      const p = await prazos.buscar(tx, prazo.id);
      if (p === undefined) throw new Error('sem prazo');
      // Só o da data manual fica no mesmo status; os demais saem do recálculo pelo status.
      await prazos.inserir(
        tx,
        Prazo.restaurar({
          ...p.estado,
          id: `${prazo.id.slice(0, -4)}aaaa` as Uuid,
          status: 'cumprido',
        }),
      );
      await prazos.inserir(
        tx,
        Prazo.restaurar({
          ...p.estado,
          id: `${prazo.id.slice(0, -4)}bbbb` as Uuid,
          status: 'cancelado',
        }),
      );
      await prazos.inserir(
        tx,
        Prazo.restaurar({
          ...p.estado,
          id: `${prazo.id.slice(0, -4)}cccc` as Uuid,
          vencimentoManual: true,
        }),
      );
    });
    dias = [feriado('2027-03-10')];
    const lote = await recalcular.executarLote(alteracao(), null);
    expect(lote).toMatchObject({ lidos: 1, alterados: 1 });
    for (const sufixo of ['aaaa', 'bbbb', 'cccc']) {
      const intacto = await outbox.executar((tx) =>
        prazos.buscar(tx, `${prazo.id.slice(0, -4)}${sufixo}` as Uuid),
      );
      expect(intacto?.estado.calculo.vencimento?.paraIso()).toBe('2027-03-23');
      expect(intacto?.recalculavel).toBe(false);
    }
  });

  it('feriado de outra UF, tribunal ou comarca, ou fora do intervalo, não alcança o prazo', async () => {
    await criado();
    dias = [feriado('2027-03-10')];
    for (const fora of [
      { abrangencia: 'uf', uf: 'XB' },
      { abrangencia: 'tribunal', tribunal: 'TJXB' },
      { abrangencia: 'comarca', tribunal: 'TJXA', comarca: 'Outra' },
      { abrangencia: 'municipio', uf: 'XA' },
      { inicio: '2027-04-01', fim: '2027-04-01' },
      { inicio: '2027-02-01', fim: '2027-02-27' },
    ]) {
      expect(await recalcular.executarLote(alteracao(fora), null)).toMatchObject({ lidos: 0 });
    }
    const daUf = await recalcular.executarLote(alteracao({ abrangencia: 'uf', uf: 'XA' }), null);
    expect(daUf).toMatchObject({ lidos: 1, alterados: 1 });
  });

  it('pagina em lotes pelo id', async () => {
    // Relógio fixo: os UUIDv7 diferem só na parte aleatória; a ordem é a dos ids.
    const [primeiro, segundo] = [(await criado()).id, (await criado()).id].sort();
    const r = relogio();
    const emLotes = new RecalcularPrazosPorCalendario(
      outbox,
      prazos,
      localizar,
      trilha,
      outbox,
      r,
      1,
    );
    dias = [feriado('2027-03-10')];
    const a = await emLotes.executarLote(alteracao(), null);
    expect(a).toMatchObject({ lidos: 1, proximo: primeiro });
    const b = await emLotes.executarLote(alteracao(), a.proximo);
    expect(b).toMatchObject({ lidos: 1, proximo: segundo });
    expect(await emLotes.executarLote(alteracao(), b.proximo)).toMatchObject({
      lidos: 0,
      proximo: null,
    });
  });

  it('prazo alterado no meio do recálculo: falha para o job tentar de novo', async () => {
    const prazo = await criado();
    dias = [feriado('2027-03-10')];
    const concorrente: typeof localizar = async (id) => {
      prazos.alterarVersao(prazo.id);
      return localizar(id);
    };
    const r = relogio();
    const comConcorrencia = new RecalcularPrazosPorCalendario(
      outbox,
      prazos,
      concorrente,
      trilha,
      outbox,
      r,
    );
    await expect(comConcorrencia.executarLote(alteracao(), null)).rejects.toThrow(
      'alterado durante o recálculo',
    );
    expect(trilha.registros.filter((x) => x.tipo === 'prazos.prazo-recalculado')).toEqual([]);
  });

  it('processo sumiu do cadastro: falha (vai à DLQ), não segue calado', async () => {
    await criado();
    const semProcesso = new RecalcularPrazosPorCalendario(
      outbox,
      prazos,
      () => Promise.resolve(undefined),
      trilha,
      outbox,
      relogio(),
    );
    await expect(semProcesso.executarLote(alteracao(), null)).rejects.toThrow('não encontrado');
  });

  it('lista os tenants do evento global como sistema; no local, só o do escritório', async () => {
    const prazo = await criado();
    await comEstado(prazo.id, 'a-confirmar', { tenantId: OUTRO_TENANT });
    const tenants = new TenantsAfetadosPeloCalendario(outbox, prazos);
    expect(await tenants.executar(alteracao())).toEqual([TENANT, OUTRO_TENANT].sort());
    expect(await tenants.executar(alteracao({ origem: 'local' }))).toEqual([TENANT]);
    expect(await tenants.executar(alteracao({ abrangencia: 'municipio', uf: 'XA' }))).toEqual([]);
    expect(
      await tenants.executar(alteracao({ origem: 'local', abrangencia: 'municipio', uf: 'XA' })),
    ).toEqual([]);
  });

  it('recusa evento fora do contrato', () => {
    expect(() => lerAlteracaoDoCalendario({ tenantId: TENANT, payload: {} })).toThrow();
  });
});
