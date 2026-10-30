import { FixedClock, Instant, LocalDate, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AjustarPrazo,
  CancelarPrazo,
  ConfirmarPrazo,
  ConsultarPrazo,
  CumprirPrazo,
  GerarPrazoDaPublicacao,
  ListarPrazos,
  MarcarPrazosVencidos,
} from '../application/ciclo-de-vida.js';
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

import type {
  ClassificacaoDoConteudo,
  DestinatarioDaPublicacao,
  DiaDoCalendario,
  ProcessoNoCalendario,
} from '../application/portas.js';
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

describe('ciclo de vida do prazo (HU24, PZ-169)', () => {
  const USUARIO = '01a10e00-0000-7000-8000-00000000d001' as Uuid;
  const quem = { usuarioId: USUARIO, canal: 'portal' as const };
  const deps = () => ({ unidade: outbox, prazos, trilha, outbox, relogio: relogio() });

  it('confirma, ajusta com motivo, cumpre: trilha e eventos em cada passo', async () => {
    const p = await criado();
    const confirmar = new ConfirmarPrazo(deps());
    const ajustar = new AjustarPrazo(deps(), calcular);
    const cumprir = new CumprirPrazo(deps());
    const c = await confirmar.executar(quem, p.id, { versao: 1 });
    expect(c.ok && c.valor).toMatchObject({ status: 'pendente', versao: 2 });

    const semMotivo = await ajustar.executar(quem, p.id, { versao: 2, motivo: 'curto', dias: 10 });
    expect(!semMotivo.ok && semMotivo.erro.codigo).toBe('validacao');
    const nada = await ajustar.executar(quem, p.id, { versao: 2, motivo: 'sem nada para ajustar' });
    expect(!nada.ok && nada.erro.codigo).toBe('validacao');

    // Dias diferentes: recalcula pelo motor (prazo do texto prevalece).
    const a = await ajustar.executar(quem, p.id, {
      versao: 2,
      motivo: 'o despacho fixou dez dias',
      dias: 10,
    });
    expect(a.ok && a.valor).toMatchObject({
      status: 'pendente',
      dias: 10,
      vencimento: '2027-03-16',
      vencimentoManual: false,
      motivoAjuste: 'o despacho fixou dez dias',
      versao: 3,
    });
    // Vencimento informado: fica definido manualmente.
    const m = await ajustar.executar(quem, p.id, {
      versao: 3,
      motivo: 'certidão do cartório com outra data',
      vencimento: '2027-03-19',
    });
    expect(m.ok && m.valor).toMatchObject({
      vencimento: '2027-03-19',
      vencimentoManual: true,
      fimDoPrazo: null,
    });
    const f = await cumprir.executar(quem, p.id, { versao: 4 });
    expect(f.ok && f.valor.status).toBe('cumprido');

    expect(trilha.registros.map((r) => r.tipo)).toEqual([
      'prazos.prazo-sugerido',
      'prazos.prazo-confirmado',
      'prazos.prazo-ajustado',
      'prazos.prazo-ajustado',
      'prazos.prazo-cumprido',
    ]);
    const tipos = (await eventosNoOutbox()).map((e) => e.tipo);
    expect(tipos).toEqual([
      'PrazoSugerido',
      'PrazoConfirmado',
      'PrazoAjustado',
      'PrazoAjustado',
      'PrazoCumprido',
    ]);
  });

  it('versão desatualizada ou transição inválida: conflito (409) sem gravar', async () => {
    const p = await criado();
    const confirmar = new ConfirmarPrazo(deps());
    const cumprir = new CumprirPrazo(deps());
    const velha = await confirmar.executar(quem, p.id, { versao: 7 });
    expect(!velha.ok && velha.erro.codigo).toBe('versao-desatualizada');
    const invalida = await cumprir.executar(quem, p.id, { versao: 1 });
    expect(!invalida.ok && invalida.erro.codigo).toBe('transicao-invalida');
    const inexistente = await confirmar.executar(quem, OUTRO_TENANT, { versao: 1 });
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('prazo-inexistente');
    // Outra gravação entre a leitura e a escrita.
    const atualizar = vi.spyOn(prazos, 'atualizar').mockResolvedValueOnce(false);
    const r = await confirmar.executar(quem, p.id, { versao: 1 });
    atualizar.mockRestore();
    expect(!r.ok && r.erro.codigo).toBe('versao-desatualizada');
    expect(trilha.registros.map((x) => x.tipo)).toEqual(['prazos.prazo-sugerido']);
  });

  it('cancela com motivo; prazo sem parâmetros só aceita vencimento informado', async () => {
    const p = await criado();
    const cancelar = new CancelarPrazo(deps());
    const sem = await cancelar.executar(quem, p.id, { versao: 1 });
    expect(!sem.ok && sem.erro.codigo).toBe('validacao');
    const r = await cancelar.executar(quem, p.id, {
      versao: 1,
      motivo: 'intimação em duplicidade',
    });
    expect(r.ok && r.valor.status).toBe('cancelado');

    const outro = await criado();
    await outbox.executar(async (tx) => {
      const atual = await prazos.buscar(tx, outro.id);
      if (atual === undefined) throw new Error('sem prazo');
      await prazos.atualizar(tx, Prazo.restaurar({ ...atual.estado, parametros: {} }), 1);
    });
    const ajustar = new AjustarPrazo(deps(), calcular);
    const a = await ajustar.executar(quem, outro.id, { versao: 1, motivo: 'mudou o ato', dias: 3 });
    expect(!a.ok && a.erro.codigo).toBe('prazo-sem-parametros');
    const consultar = new ConsultarPrazo(outbox, prazos);
    const detalhe = await consultar.executar(outro.id);
    expect(detalhe.ok && detalhe.valor).toMatchObject({ id: outro.id, parametros: {} });
    const nenhum = await consultar.executar(OUTRO_TENANT);
    expect(nenhum.ok).toBe(false);
  });

  it('lista por vencimento com cursor e filtro de status', async () => {
    await criado();
    await criado({ dataDeReferencia: '2027-03-08' });
    await criado({ ramo: undefined });
    const listar = new ListarPrazos(outbox, prazos);
    const a = await listar.executar({ limite: '2' });
    if (!a.ok) throw a.erro;
    expect(a.valor.itens.map((i) => i.vencimento)).toEqual(['2027-03-23', '2027-03-30']);
    const b = await listar.executar({ limite: '2', cursor: a.valor.proximoCursor });
    expect(b.ok && b.valor.itens.map((i) => i.vencimento)).toEqual([null]);
    expect(b.ok && b.valor.proximoCursor).toBeNull();
    const filtro = await listar.executar({ status: 'pendente' });
    expect(filtro.ok && filtro.valor.itens).toEqual([]);
    for (const cursor of ['nao-e-json', Buffer.from('{"v":1}').toString('base64url')]) {
      const r = await listar.executar({ cursor });
      expect(!r.ok && r.erro.codigo).toBe('validacao');
    }
  });

  it('job diário marca vencidos os abertos depois do vencimento, por tenant', async () => {
    const p = await criado();
    const confirmado = await comEstado(p.id, 'pendente');
    const tarde = new FixedClock(Instant.deIso('2027-03-24T07:00:00.000Z'));
    const marcar = new MarcarPrazosVencidos(outbox, (_t, trabalho) => trabalho(), {
      ...deps(),
      relogio: tarde,
    });
    expect(await marcar.executar()).toEqual({ tenants: 1, vencidos: 2 });
    const depois = await outbox.executar((tx) => prazos.buscar(tx, confirmado));
    expect(depois?.estado.status).toBe('vencido');
    expect(trilha.registros.filter((r) => r.tipo === 'prazos.prazo-vencido')).toHaveLength(2);
    expect(await marcar.executar()).toEqual({ tenants: 0, vencidos: 0 });
  });
});

describe('geração automática a partir da publicação (HU24, PZ-168)', () => {
  const CONTEUDO = '01a10e00-0000-7000-8000-0000000c0aaa' as Uuid;
  const OAB = '01a10e00-0000-7000-8000-00000000ab01' as Uuid;
  const ADVOGADO = '01a10e00-0000-7000-8000-00000000ad01' as Uuid;
  let classificacao: ClassificacaoDoConteudo | undefined;
  let destinatario: DestinatarioDaPublicacao | undefined;
  const gerar = () =>
    new GerarPrazoDaPublicacao(
      outbox,
      prazos,
      {
        classificacao: () => Promise.resolve(classificacao),
        destinatario: () => Promise.resolve(destinatario),
        responsavelDaOab: (id) => Promise.resolve(id === OAB ? ADVOGADO : undefined),
      },
      calcular,
      criar,
    );
  beforeEach(() => {
    classificacao = { tipoAto: 'ato-ficticio', situacao: 'ok', confianca: 0.97, prazoCitado: null };
    destinatario = { processoId: PROCESSO, oabId: OAB, dataDisponibilizacao: d('2027-03-01') };
  });

  it('gera "a confirmar" pelo DJEN, com o responsável da OAB, uma vez só', async () => {
    expect(await gerar().executar(TENANT, CONTEUDO)).toBe('criado');
    expect(await gerar().executar(TENANT, CONTEUDO)).toBe('ja-existe');
    const [prazo] = await outbox.executar((tx) => prazos.listar(tx, { limite: 10 }));
    expect(prazo?.estado).toMatchObject({
      origem: 'djen',
      status: 'a-confirmar',
      responsavelId: ADVOGADO,
      publicacaoConteudoId: CONTEUDO,
      classificacaoIncerta: false,
    });
  });

  it('ato desconhecido ou confiança baixa também geram, com destaque', async () => {
    classificacao = {
      tipoAto: null,
      situacao: 'revisao_manual',
      confianca: null,
      prazoCitado: null,
    };
    expect(await gerar().executar(TENANT, CONTEUDO)).toBe('criado');
    const [prazo] = await outbox.executar((tx) => prazos.listar(tx, { limite: 10 }));
    expect(prazo?.estado).toMatchObject({ tipoAto: 'desconhecido', classificacaoIncerta: true });
  });

  it('prazo citado no texto vira o prazo do ato; divergente fica de fora', async () => {
    classificacao = {
      tipoAto: 'ato-sem-tabela',
      situacao: 'ok',
      confianca: 0.6,
      prazoCitado: { quantidade: 5, unidade: 'dias-uteis', divergente: false },
    };
    expect(await gerar().executar(TENANT, CONTEUDO)).toBe('criado');
    const [prazo] = await outbox.executar((tx) => prazos.listar(tx, { limite: 10 }));
    expect(prazo?.estado).toMatchObject({
      classificacaoIncerta: true,
      parametros: { prazoNoTexto: { dias: 5, unidade: 'dias' } },
    });
  });

  it('não gera: sem classificação, sem processo, ou ato seguro sem prazo (mero expediente)', async () => {
    classificacao = undefined;
    expect(await gerar().executar(TENANT, CONTEUDO)).toBe('sem-classificacao');
    classificacao = {
      tipoAto: 'ato-sem-tabela',
      situacao: 'ok',
      confianca: 0.99,
      prazoCitado: null,
    };
    // Rito conhecido (trabalhista), ato seguro, sem linha na tabela nem prazo no texto.
    destinatario = { processoId: PROCESSO_TRT, oabId: null, dataDisponibilizacao: d('2027-03-01') };
    expect(await gerar().executar(TENANT, CONTEUDO)).toBe('sem-prazo-aplicavel');
    destinatario = { processoId: null, oabId: null, dataDisponibilizacao: d('2027-03-01') };
    expect(await gerar().executar(TENANT, CONTEUDO)).toBe('sem-processo');
    destinatario = undefined;
    await expect(gerar().executar(TENANT, CONTEUDO)).rejects.toThrow('sem destinatário');
  });
});

describe('ciclo de vida: entradas e filtros (HU24)', () => {
  const quem = { usuarioId: '01a10e00-0000-7000-8000-00000000d001' as Uuid, canal: 'app' as const };
  const deps = () => ({ unidade: outbox, prazos, trilha, outbox, relogio: relogio() });

  it('recusa corpo inválido em cada ação e data inválida no ajuste', async () => {
    const p = await criado();
    for (const acao of [
      new ConfirmarPrazo(deps()),
      new CumprirPrazo(deps()),
      new CancelarPrazo(deps()),
    ]) {
      const r = await acao.executar(quem, p.id, { versao: 'um' });
      expect(!r.ok && r.erro.codigo).toBe('validacao');
    }
    const r = await new AjustarPrazo(deps(), calcular).executar(quem, p.id, {
      versao: 1,
      motivo: 'data errada no ajuste',
      vencimento: '31/03/2027',
    });
    expect(!r.ok && r.erro.codigo).toBe('validacao');
  });

  it('ajusta ramo e unidade pelo motor; processo inválido no recálculo vira erro', async () => {
    const p = await criado({ ramo: undefined });
    const ajustar = new AjustarPrazo(deps(), calcular);
    const r = await ajustar.executar(quem, p.id, {
      versao: 1,
      motivo: 'o processo é cível comum',
      ramo: 'civel',
      dias: 5,
      unidade: 'dias',
    });
    expect(r.ok && r.valor).toMatchObject({ ramo: 'civel', dias: 5, situacao: 'calculado' });
    const manual = await ajustar.executar(quem, p.id, {
      versao: 2,
      motivo: 'data do cartório com ato e ramo',
      vencimento: '2027-03-12',
      tipoAto: 'outro-ato',
      ramo: 'civel',
      dias: 4,
      unidade: 'dias',
    });
    expect(manual.ok && manual.valor).toMatchObject({ tipoAto: 'outro-ato', dias: 4 });
    const outro = await criado();
    await outbox.executar(async (tx) => {
      const atual = await prazos.buscar(tx, outro.id);
      if (atual === undefined) throw new Error('sem prazo');
      await prazos.atualizar(tx, Prazo.restaurar({ ...atual.estado, processoId: OUTRO_TENANT }), 1);
    });
    const semProcesso = await ajustar.executar(quem, outro.id, {
      versao: 1,
      motivo: 'mudou o ato',
      dias: 3,
    });
    expect(!semProcesso.ok && semProcesso.erro.codigo).toBe('processo-inexistente');
  });

  it('lista por processo e responsável; cursor do último sem vencimento', async () => {
    const r = await criar.executar(
      await sugerir({ ramo: undefined }),
      { origem: 'manual', responsavelId: OUTRO_TENANT, publicacaoConteudoId: null },
      autor,
    );
    if (!r.ok) throw r.erro;
    await criado();
    const listar = new ListarPrazos(outbox, prazos);
    const doResponsavel = await listar.executar({
      responsavelId: OUTRO_TENANT,
      processoId: PROCESSO,
    });
    expect(doResponsavel.ok && doResponsavel.valor.itens.map((i) => i.id)).toEqual([r.valor.id]);
    const cursor = Buffer.from(JSON.stringify({ v: null, id: r.valor.id })).toString('base64url');
    const depois = await listar.executar({ cursor });
    expect(depois.ok && depois.valor.itens).toEqual([]);
    const invalida = await listar.executar({ limite: 'mil' });
    expect(!invalida.ok && invalida.erro.codigo).toBe('validacao');
  });

  it('geração: OAB sem advogado fica sem responsável; erro do cálculo lança', async () => {
    const gerar = (destinatario: DestinatarioDaPublicacao) =>
      new GerarPrazoDaPublicacao(
        outbox,
        prazos,
        {
          classificacao: () =>
            Promise.resolve({
              tipoAto: 'ato-ficticio',
              situacao: 'a_confirmar',
              confianca: 0.9,
              prazoCitado: null,
            }),
          destinatario: () => Promise.resolve(destinatario),
          responsavelDaOab: () => Promise.resolve(undefined),
        },
        calcular,
        criar,
      );
    const conteudo = '01a10e00-0000-7000-8000-0000000c0bbb' as Uuid;
    const base = { oabId: OUTRO_TENANT, dataDisponibilizacao: d('2027-03-01') };
    expect(await gerar({ ...base, processoId: PROCESSO }).executar(TENANT, conteudo)).toBe(
      'criado',
    );
    const [prazo] = await outbox.executar((tx) => prazos.listar(tx, { limite: 10 }));
    expect(prazo?.estado).toMatchObject({ responsavelId: null, classificacaoIncerta: true });
    await expect(
      gerar({ ...base, processoId: OUTRO_TENANT }).executar(TENANT, OUTRO_TENANT),
    ).rejects.toThrow();
  });
});
