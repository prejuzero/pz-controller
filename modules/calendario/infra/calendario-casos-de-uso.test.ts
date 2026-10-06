import { gerarUuidV7, LocalDate, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AprovarEventoDoCalendario,
  CadastrarFeriadoLocal,
  ConsultarCalendario,
  ConsultarDiasNaoUteis,
  InvalidarCacheDoCalendario,
  ProporEventoDoCalendario,
  RevogarEventoDoCalendario,
  RevogarFeriadoLocal,
} from '../application/calendario.js';
import { ANA, BETO, CAIO, relogio } from '../teste/ficticios.js';

import { EventosGlobaisEmMemoria, FeriadosLocaisEmMemoria } from './em-memoria.js';

import type { AutorEmAcao } from '../application/calendario.js';
import type { AlteracaoDoCalendario, CacheDeDiasNaoUteis } from '../application/portas.js';
import type { DiaNaoUtil } from '../domain/dias-nao-uteis.js';
import type { EntradaDeAuditoria, OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria } from '@pz/kernel';

class TrilhaFalsa implements TrilhaDeAuditoria<TransacaoEmMemoria> {
  readonly registros: { entrada: EntradaDeAuditoria; origem: OrigemDaAuditoria }[] = [];
  registrar(transacao: TransacaoEmMemoria, entrada: EntradaDeAuditoria, origem: OrigemDaAuditoria) {
    transacao.aoConfirmar(() => this.registros.push({ entrada, origem }));
    return Promise.resolve();
  }
}

const ana: AutorEmAcao = { ...ANA, canal: 'portal' };
const beto: AutorEmAcao = { ...BETO, canal: 'portal' };
const caio: AutorEmAcao = { ...CAIO, canal: 'app' };
// Conteúdo FICTÍCIO (só exercita o mecanismo).
const entrada = (parcial: Record<string, unknown> = {}) => ({
  abrangencia: 'nacional',
  tipo: 'feriado',
  inicio: '2030-03-10',
  fim: '2030-03-10',
  descricao: 'FICTÍCIO: Dia de Teste',
  atoNormativo: 'FICTÍCIO: Lei de Teste, art. 1º',
  urlAto: 'https://exemplo.invalid/ficticio',
  ...parcial,
});
const comarca = { abrangencia: 'comarca', tribunal: ' tjxa ', comarca: ' Alfa ' };

let outbox: OutboxEmMemoria;
let trilha: TrilhaFalsa;
let globais: EventosGlobaisEmMemoria;
let locais: FeriadosLocaisEmMemoria;
let propor: ProporEventoDoCalendario<TransacaoEmMemoria>;
let aprovar: AprovarEventoDoCalendario<TransacaoEmMemoria>;
let revogar: RevogarEventoDoCalendario<TransacaoEmMemoria>;
let cadastrar: CadastrarFeriadoLocal<TransacaoEmMemoria>;
let revogarLocal: RevogarFeriadoLocal<TransacaoEmMemoria>;
let consultar: ConsultarCalendario<TransacaoEmMemoria>;
let dias: ConsultarDiasNaoUteis<TransacaoEmMemoria>;

const eventosNoOutbox = () => outbox.executar((tx) => outbox.reservarPendentes(tx, 100));
const tipos = () => trilha.registros.map((r) => r.entrada.tipo);

async function aprovado(parcial: Record<string, unknown> = {}) {
  const p = await propor.executar(ana, entrada(parcial));
  if (!p.ok) throw p.erro;
  const a = await aprovar.executar(beto, p.valor.id);
  if (!a.ok) throw a.erro;
  return a.valor;
}

beforeEach(() => {
  outbox = new OutboxEmMemoria();
  trilha = new TrilhaFalsa();
  globais = new EventosGlobaisEmMemoria();
  locais = new FeriadosLocaisEmMemoria();
  const r = relogio();
  propor = new ProporEventoDoCalendario(outbox, globais, trilha, r);
  aprovar = new AprovarEventoDoCalendario(outbox, globais, trilha, outbox, r);
  revogar = new RevogarEventoDoCalendario(outbox, globais, trilha, outbox, r);
  cadastrar = new CadastrarFeriadoLocal(outbox, locais, trilha, outbox, r);
  revogarLocal = new RevogarFeriadoLocal(outbox, locais, trilha, outbox, r);
  consultar = new ConsultarCalendario(outbox, globais, locais);
  dias = new ConsultarDiasNaoUteis(outbox, globais, locais);
});

describe('calendário global (HU13)', () => {
  it('proposta: valida, grava rascunho e audita, sem evento de domínio', async () => {
    const invalida = await propor.executar(ana, entrada({ abrangencia: 'uf', urlAto: 'http://x' }));
    expect(!invalida.ok && invalida.erro.problemas.map((p) => p.campo)).toEqual(['urlAto']);
    const semUf = await propor.executar(ana, entrada({ abrangencia: 'uf' }));
    expect(!semUf.ok && semUf.erro.problemas.map((p) => p.campo)).toEqual(['uf']);
    expect(trilha.registros).toEqual([]);

    const r = await propor.executar(ana, entrada({ abrangencia: 'uf', uf: 'xa' }));
    if (!r.ok) throw r.erro;
    expect(r.valor).toMatchObject({ status: 'rascunho', uf: 'XA', aprovadoPor: null });
    expect(tipos()).toEqual(['calendario.evento-proposto']);
    expect(trilha.registros[0]?.origem).toEqual({ canal: 'portal', usuarioId: ANA.usuarioId });
    expect(await eventosNoOutbox()).toEqual([]);
  });

  it('aprovação por outra pessoa: audita antes e depois e publica CalendarioAlterado', async () => {
    const p = await propor.executar(ana, entrada());
    if (!p.ok) throw p.erro;
    const propria = await aprovar.executar(ana, p.valor.id);
    expect(!propria.ok && propria.erro.codigo).toBe('aprovacao-pelo-proponente');
    const a = await aprovar.executar(beto, p.valor.id);
    if (!a.ok) throw a.erro;
    expect(a.valor.aprovadoPor).toBe(BETO.usuarioId);
    expect(trilha.registros[1]?.entrada).toMatchObject({
      tipo: 'calendario.evento-aprovado',
      antes: { status: 'rascunho' },
      depois: { status: 'aprovado' },
    });
    expect((await eventosNoOutbox()).map((e) => e.tipo)).toEqual(['CalendarioAlterado']);
    const de_novo = await aprovar.executar(beto, p.valor.id);
    expect(!de_novo.ok && de_novo.erro.codigo).toBe('evento-ja-aprovado');
    const inexistente = await aprovar.executar(beto, gerarUuidV7(relogio()));
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('evento-inexistente');
  });

  it('revogação com motivo: some do cálculo, fica na trilha e publica o evento', async () => {
    const evento = await aprovado();
    expect((await revogar.executar(ana, evento.id, { motivo: 'curto' })).ok).toBe(false);
    const r = await revogar.executar(ana, evento.id, { motivo: 'ato revogado pelo tribunal' });
    if (!r.ok) throw r.erro;
    expect(r.valor).toMatchObject({
      revogadoPor: ANA.usuarioId,
      motivoRevogacao: 'ato revogado pelo tribunal',
    });
    expect(tipos().at(-1)).toBe('calendario.evento-revogado');
    expect((await eventosNoOutbox()).map((e) => e.payload)).toMatchObject([
      { acao: 'incluido' },
      { acao: 'revogado' },
    ]);
    const de_novo = await revogar.executar(ana, evento.id, {
      motivo: 'ato revogado pelo tribunal',
    });
    expect(!de_novo.ok && de_novo.erro.codigo).toBe('evento-nao-vigente');
    const inexistente = await revogar.executar(ana, gerarUuidV7(relogio()), {
      motivo: 'ato revogado pelo tribunal',
    });
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('evento-inexistente');
  });
});

describe('feriados locais (HU13)', () => {
  it('cadastra no tenant do autor, normaliza a jurisdição, audita e publica', async () => {
    const nacional = await cadastrar.executar(caio, entrada());
    expect(nacional.ok).toBe(false);
    const r = await cadastrar.executar(caio, entrada(comarca));
    if (!r.ok) throw r.erro;
    expect(r.valor).toMatchObject({
      tribunal: 'TJXA',
      comarca: 'Alfa',
      cadastradoPor: CAIO.usuarioId,
    });
    expect(tipos()).toEqual(['calendario.feriado-local-cadastrado']);
    const [evento] = await eventosNoOutbox();
    expect(evento?.tenantId).toBe(CAIO.tenantId);
  });

  it('revoga uma vez; inexistente é 404', async () => {
    const r = await cadastrar.executar(caio, entrada(comarca));
    if (!r.ok) throw r.erro;
    expect((await revogarLocal.executar(caio, r.valor.id)).ok).toBe(true);
    const de_novo = await revogarLocal.executar(caio, r.valor.id);
    expect(!de_novo.ok && de_novo.erro.codigo).toBe('feriado-ja-revogado');
    const inexistente = await revogarLocal.executar(caio, gerarUuidV7(relogio()));
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('evento-inexistente');
    expect(tipos()).toEqual([
      'calendario.feriado-local-cadastrado',
      'calendario.feriado-local-revogado',
    ]);
  });
});

describe('consultas (HU13)', () => {
  it('lista globais e locais que cruzam o período', async () => {
    await aprovado({ inicio: '2030-01-05', fim: '2030-01-06' });
    await propor.executar(ana, entrada({ inicio: '2031-01-01', fim: '2031-01-01' }));
    await cadastrar.executar(
      caio,
      entrada({ ...comarca, inicio: '2030-02-01', fim: '2030-02-01' }),
    );
    const filtro = { inicio: LocalDate.de(2030, 1, 6), fim: LocalDate.de(2030, 12, 31) };
    expect((await consultar.globaisListados(filtro)).map((e) => e.inicio)).toEqual(['2030-01-05']);
    expect((await consultar.globaisListados({})).map((e) => e.status)).toEqual([
      'aprovado',
      'rascunho',
    ]);
    expect((await consultar.locaisListados(filtro)).map((e) => e.inicio)).toEqual(['2030-02-01']);
  });

  it('diasNaoUteis: só globais aprovados e vigentes mais os locais da jurisdição', async () => {
    await aprovado({ inicio: '2030-03-10', fim: '2030-03-11', descricao: 'FICTÍCIO: global' });
    await propor.executar(ana, entrada({ inicio: '2030-03-12', fim: '2030-03-12' }));
    const revogado = await aprovado({ inicio: '2030-03-13', fim: '2030-03-13' });
    await revogar.executar(ana, revogado.id, { motivo: 'ato revogado pelo tribunal' });
    await cadastrar.executar(
      caio,
      entrada({ ...comarca, inicio: '2030-03-14', fim: '2030-03-14' }),
    );
    const local = await cadastrar.executar(
      caio,
      entrada({ ...comarca, inicio: '2030-03-15', fim: '2030-03-15' }),
    );
    if (!local.ok) throw local.erro;
    await revogarLocal.executar(caio, local.valor.id);

    const r = await dias.executar({
      jurisdicao: { tribunal: 'tjxa', comarca: 'Alfa' },
      inicio: '2030-03-01',
      fim: '2030-03-31',
    });
    if (!r.ok) throw r.erro;
    expect(r.valor.map((d) => [d.data.paraIso(), d.fonte.origem])).toEqual([
      ['2030-03-10', 'global'],
      ['2030-03-11', 'global'],
      ['2030-03-14', 'local'],
    ]);
    const outraComarca = await dias.executar({
      jurisdicao: { tribunal: 'TJXA', comarca: 'Beta' },
      inicio: '2030-03-01',
      fim: '2030-03-31',
    });
    expect(outraComarca.ok && outraComarca.valor.map((d) => d.data.paraIso())).toEqual([
      '2030-03-10',
      '2030-03-11',
    ]);
  });

  it('diasNaoUteis valida o período (ordem e no máximo três anos) e a jurisdição', async () => {
    const invertido = await dias.executar({
      jurisdicao: {},
      inicio: '2030-02-01',
      fim: '2030-01-01',
    });
    expect(!invertido.ok && invertido.erro.problemas[0]?.campo).toBe('fim');
    const longo = await dias.executar({ jurisdicao: {}, inicio: '2030-01-01', fim: '2034-01-01' });
    expect(!longo.ok && longo.erro.problemas[0]?.mensagem).toBe('Período longo demais.');
    const uf = await dias.executar({
      jurisdicao: { uf: 'XYZ' },
      inicio: '2030-01-01',
      fim: '2030-01-01',
    });
    expect(!uf.ok && uf.erro.problemas[0]?.campo).toBe('jurisdicao.uf');
  });
});

/** Cache em memória com a mesma interface: só para observar o caso de uso. */
class CacheFalso implements CacheDeDiasNaoUteis {
  readonly anos = new Map<number, DiaNaoUtil[]>();
  readonly calculos: number[] = [];
  readonly invalidacoes: AlteracaoDoCalendario[] = [];

  async doAno(_j: unknown, ano: number, calcular: () => Promise<DiaNaoUtil[]>) {
    const guardado = this.anos.get(ano);
    if (guardado !== undefined) return guardado;
    this.calculos.push(ano);
    const dias = await calcular();
    this.anos.set(ano, dias);
    return dias;
  }

  invalidar(alteracao: AlteracaoDoCalendario): Promise<void> {
    this.invalidacoes.push(alteracao);
    for (const ano of alteracao.anos) this.anos.delete(ano);
    return Promise.resolve();
  }
}

describe('cache de diasNaoUteis por (jurisdição, ano) (HU13)', () => {
  const periodo = { jurisdicao: { tribunal: 'TJXA', comarca: 'Alfa' } };

  it('guarda o ano inteiro, recorta o período e dá o mesmo resultado que sem cache', async () => {
    await aprovado({ inicio: '2030-12-20', fim: '2031-01-20', tipo: 'recesso' });
    await aprovado({ inicio: '2031-03-10', fim: '2031-03-10' });
    const cache = new CacheFalso();
    const comCache = new ConsultarDiasNaoUteis(outbox, globais, locais, cache);
    const consulta = { ...periodo, inicio: '2030-12-30', fim: '2031-01-02' };

    const r = await comCache.executar(consulta);
    const semCache = await dias.executar(consulta);
    if (!r.ok || !semCache.ok) throw new Error('consulta inválida');
    expect(r.valor.map((d) => d.data.paraIso())).toEqual([
      '2030-12-30',
      '2030-12-31',
      '2031-01-01',
      '2031-01-02',
    ]);
    expect(r.valor).toEqual(semCache.valor);
    expect(cache.calculos).toEqual([2030, 2031]);
    expect(cache.anos.get(2031)?.length).toBe(21);

    await comCache.executar({ ...periodo, inicio: '2031-03-01', fim: '2031-03-31' });
    expect(cache.calculos).toEqual([2030, 2031]);
  });

  it('InvalidarCacheDoCalendario: anos do período do evento, origem e tenant', async () => {
    const cache = new CacheFalso();
    const comCache = new ConsultarDiasNaoUteis(outbox, globais, locais, cache);
    const consulta = { ...periodo, inicio: '2030-03-01', fim: '2030-03-31' };
    await comCache.executar(consulta);
    const feriado = await cadastrar.executar(
      caio,
      entrada({ ...comarca, inicio: '2030-03-14', fim: '2030-03-14' }),
    );
    if (!feriado.ok) throw feriado.erro;
    const [evento] = await eventosNoOutbox();

    await new InvalidarCacheDoCalendario(cache).executar(evento);
    expect(cache.invalidacoes).toEqual([
      { origem: 'local', tenantId: CAIO.tenantId, anos: [2030] },
    ]);
    const depois = await comCache.executar(consulta);
    expect(depois.ok && depois.valor.map((d) => d.data.paraIso())).toEqual(['2030-03-14']);
  });

  it('InvalidarCacheDoCalendario recusa evento malformado (vai para a DLQ)', async () => {
    const invalidar = new InvalidarCacheDoCalendario(new CacheFalso());
    await expect(invalidar.executar({ tenantId: 'x', payload: {} })).rejects.toThrow();
  });
});
