import { ErroLimiteExcedido, ErroTransitorio } from '@pz/integracoes';
import { FixedClock, gerarUuidV7, Instant, LocalDate, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConsultarStatusDaCaptura,
  ExecutarCaptura,
  ManterAssinaturas,
  PlanejarBuscaAgora,
  PlanejarCaptura,
  PUBLICACOES_POR_EVENTO,
  RegistrarProximaRodada,
  SolicitarBuscaAgora,
} from '../application/captura.js';
import { FALHAS_PARA_ALERTAR_ALVO, FALHAS_PARA_DEGRADAR } from '../domain/fonte.js';

import { CapturaEmMemoria } from './em-memoria.js';

import type { FontePublicacoes, PublicacaoCapturada } from '@pz/integracoes';
import type { Uuid } from '@pz/kernel';

// Tenants, OABs e publicações FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const TENANT_A = gerarUuidV7();
const TENANT_B = gerarUuidV7();
const oab = (tenantId: Uuid, oabId: Uuid = gerarUuidV7()) => ({
  tenantId,
  payload: { advogadoId: gerarUuidV7(), oabId, numero: '123456', uf: 'SP', tipo: 'principal' },
});
const publicacao: PublicacaoCapturada = {
  fonte: 'falsa',
  idExterno: '1',
  hashConteudo: 'a'.repeat(64),
  dataDisponibilizacao: LocalDate.de(2026, 10, 6),
  teor: 'FICTÍCIO',
  numeroCnj: '1000004-06.2026.8.26.0100',
  destinatarios: [{ oab: { numero: '123456', uf: 'SP' } }],
  urlFonte: 'https://exemplo.invalid/certidao',
  metadados: {},
};

class FonteFalsa implements FontePublicacoes {
  readonly chamadas: string[] = [];
  /** Quantas publicações a busca por OAB devolve (padrão: 1). */
  quantidade = 1;
  falhar: false | 'fora-do-ar' | 'cota' | true = false;
  buscarPorOab(o: { numero: string; uf: string }, j: { inicio: LocalDate; fim: LocalDate }) {
    this.chamadas.push(`oab ${o.numero}/${o.uf} ${j.inicio.paraIso()}..${j.fim.paraIso()}`);
    if (this.falhar === 'cota') return Promise.reject(new ErroLimiteExcedido('429', 'falsa'));
    if (this.falhar !== false) return Promise.reject(new ErroTransitorio('fora do ar', 'falsa'));
    return Promise.resolve(
      Array.from({ length: this.quantidade }, (_, i) => ({
        ...publicacao,
        idExterno: String(i + 1),
      })),
    );
  }
  buscarPorProcesso(numero: string) {
    this.chamadas.push(`processo ${numero}`);
    return Promise.resolve([publicacao]);
  }
  buscarPorNome(nome: string) {
    this.chamadas.push(`nome ${nome}`);
    return Promise.resolve([publicacao]);
  }
  saude() {
    return Promise.resolve({ estado: 'operacional' as const, verificadoEm: relogio.agora() });
  }
}

let repo: CapturaEmMemoria;
let outbox: OutboxEmMemoria;
let fonte: FonteFalsa;
let manter: ManterAssinaturas<unknown>;
let planejar: PlanejarCaptura<unknown>;
let executar: ExecutarCaptura<unknown>;
let alertas: string[];
const alertasFalsos = () => ({
  fonteDegradada: (f: string, n: number) => alertas.push(`degradada ${f} ${String(n)}`),
  fonteRestabelecida: (f: string, n: number) => alertas.push(`restabelecida ${f} ${String(n)}`),
  alvoFalhando: (_id: Uuid, n: number) => alertas.push(`alvo ${String(n)}`),
});

beforeEach(() => {
  repo = new CapturaEmMemoria();
  outbox = new OutboxEmMemoria();
  fonte = new FonteFalsa();
  manter = new ManterAssinaturas(repo, relogio);
  planejar = new PlanejarCaptura(outbox, repo, relogio, {
    diasIniciais: 7,
    fonte: 'falsa',
  });
  alertas = [];
  executar = new ExecutarCaptura(outbox, repo, fonte, outbox, relogio, 'falsa', alertasFalsos());
});

let rodadas = 0;
const rodada = () => `r${String(++rodadas)}`;

const emTx = <T>(trabalho: (tx: never) => Promise<T>) =>
  outbox.executar((tx) => trabalho(tx as never));
const eventos = () => outbox.executar((tx) => outbox.reservarPendentes(tx, 100));

describe('assinaturas (HU17)', () => {
  it('a mesma OAB em dois tenants vira um alvo com dois assinantes; repetir não duplica', async () => {
    const evento = oab(TENANT_A);
    await emTx((tx) => manter.oabAdicionada(tx, evento));
    await emTx((tx) => manter.oabAdicionada(tx, evento));
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_B)));
    expect(repo.alvos.size).toBe(1);
    expect(repo.assinaturas.map((a) => a.tenantId)).toEqual([TENANT_A, TENANT_B]);

    await emTx((tx) => manter.oabRemovida(tx, evento));
    await emTx((tx) => manter.oabRemovida(tx, evento));
    expect(repo.assinaturas.map((a) => a.tenantId)).toEqual([TENANT_B]);
  });

  it('processo monitorado assina o alvo pelo número; payload inválido lança', async () => {
    const processoId = gerarUuidV7();
    await emTx((tx) =>
      manter.processoMonitorado(tx, {
        tenantId: TENANT_A,
        payload: {
          processoId,
          numeroCnj: '10000040620268260100',
          tribunal: 'TJSP',
          origem: 'manual',
        },
      }),
    );
    expect(repo.alvo('processo', '10000040620268260100')).toBeDefined();
    await expect(
      emTx((tx) => manter.oabAdicionada(tx, { tenantId: 'x', payload: {} })),
    ).rejects.toThrow();
  });
});

describe('nomes monitorados (HU42)', () => {
  it('o mesmo nome em dois escritórios é um alvo só; a remoção tira só a assinatura', async () => {
    const nome = (tenantId: string, grafia: string, nomeId = gerarUuidV7()) => ({
      tenantId,
      payload: { nomeId, nome: grafia },
    });
    const daA = nome(TENANT_A, 'Sociedade Fictícia de Advogados');
    await emTx((tx) => manter.nomeAdicionado(tx, daA));
    await emTx((tx) =>
      manter.nomeAdicionado(tx, nome(TENANT_B, ' SOCIEDADE  fictícia DE ADVOGADOS')),
    );
    expect(repo.alvos.size).toBe(1);
    expect(repo.alvo('nome', 'SOCIEDADE FICTÍCIA DE ADVOGADOS')).toBeDefined();
    await emTx((tx) => manter.nomeRemovido(tx, daA));
    expect(repo.assinaturas.map((a) => a.tenantId)).toEqual([TENANT_B]);

    const [plano] = await planejar.executar(rodada());
    await executar.executar(plano);
    expect(fonte.chamadas).toEqual(['nome SOCIEDADE FICTÍCIA DE ADVOGADOS']);
    expect(outbox.pendentes().at(-1)).toMatchObject({
      tipo: 'CapturaConcluida',
      tenantId: TENANT_B,
      payload: { tipo: 'nome' },
    });
  });
});

describe('planejamento e execução (HU17)', () => {
  it('muitas publicações viram lotes de CapturaConcluida (transação curta na ingestão, PZ-309)', async () => {
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    fonte.quantidade = PUBLICACOES_POR_EVENTO * 2 + 1;
    const [plano] = await planejar.executar(rodada());
    if (plano === undefined) throw new Error('sem plano');
    expect(await executar.executar(plano)).toMatchObject({
      situacao: 'entregue',
      publicacoes: PUBLICACOES_POR_EVENTO * 2 + 1,
    });
    const lotes = (await eventos()).map(
      (e) => (e.payload as { publicacoes: { idExterno: string }[] }).publicacoes,
    );
    expect(lotes.map((l) => l.length)).toEqual([PUBLICACOES_POR_EVENTO, PUBLICACOES_POR_EVENTO, 1]);
    expect(lotes.flat().map((p) => p.idExterno)).toEqual(
      Array.from({ length: PUBLICACOES_POR_EVENTO * 2 + 1 }, (_, i) => String(i + 1)),
    );
  });

  it('uma consulta por alvo, um CapturaConcluida por tenant e checkpoint da janela', async () => {
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_B)));

    const [plano, ...resto] = await planejar.executar(rodada());
    expect(resto).toEqual([]);
    expect(plano).toMatchObject({
      tipo: 'oab',
      valor: '123456/SP',
      inicio: '2026-09-30',
      fim: '2026-10-07',
    });

    expect(await executar.executar(plano)).toEqual({
      situacao: 'entregue',
      publicacoes: 1,
      tenants: 2,
    });
    expect(fonte.chamadas).toEqual(['oab 123456/SP 2026-09-30..2026-10-07']);
    const emitidos = await eventos();
    expect(emitidos.map((e) => [e.tipo, e.tenantId])).toEqual([
      ['CapturaConcluida', TENANT_A],
      ['CapturaConcluida', TENANT_B],
    ]);
    expect(emitidos[0]?.payload).toMatchObject({
      janela: { inicio: '2026-09-30', fim: '2026-10-07' },
      fonte: 'falsa',
      publicacoes: [
        {
          idExterno: '1',
          dataDisponibilizacao: '2026-10-06',
          destinatarios: [{ numero: '123456', uf: 'SP' }],
        },
      ],
    });

    // Repetir o mesmo job (retentativa) não entrega de novo; a chave leva a rodada.
    expect(plano?.chave).toBe(
      `${String(plano?.alvoId)}:2026-09-30:2026-10-07:${String(plano?.rodada)}`,
    );
    expect(await executar.executar(plano)).toEqual({ situacao: 'ja-entregue' });
    expect(await eventos()).toHaveLength(2);
    // A próxima janela começa um dia antes do último fim.
    expect((await planejar.executar(rodada()))[0]).toMatchObject({
      inicio: '2026-10-06',
      fim: '2026-10-07',
    });
  });

  it('processo: consulta pelo número formatado', async () => {
    await emTx((tx) =>
      manter.processoMonitorado(tx, {
        tenantId: TENANT_A,
        payload: {
          processoId: gerarUuidV7(),
          numeroCnj: '10000040620268260100',
          tribunal: null,
          origem: 'captura',
        },
      }),
    );
    const [plano] = await planejar.executar(rodada());
    await executar.executar(plano);
    expect(fonte.chamadas).toEqual(['processo 1000004-06.2026.8.26.0100']);
  });

  it('falha da fonte: registra o recuo, relança e o alvo sai do planejamento até a hora', async () => {
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    const [plano] = await planejar.executar(rodada());
    fonte.falhar = true;
    await expect(executar.executar(plano)).rejects.toBeInstanceOf(ErroTransitorio);
    expect(repo.alvo('oab', '123456/SP')?.falhasConsecutivas).toBe(1);
    expect(await planejar.executar(rodada())).toEqual([]);
    expect(await eventos()).toHaveLength(0);
  });

  it('alvo sem assinante não é planejado; alvo inexistente não entrega', async () => {
    const evento = oab(TENANT_A);
    await emTx((tx) => manter.oabAdicionada(tx, evento));
    await emTx((tx) => manter.oabRemovida(tx, evento));
    expect(await planejar.executar(rodada())).toEqual([]);
    expect(
      await executar.executar({
        alvoId: gerarUuidV7(),
        tipo: 'oab',
        valor: '123456/SP',
        inicio: '2026-10-01',
        fim: '2026-10-07',
      }),
    ).toEqual({ situacao: 'alvo-inexistente' });
    await expect(executar.executar({ alvoId: 'x' })).rejects.toThrow();
  });
});

describe('saúde da fonte e recaptura (HU19)', () => {
  it('falhas seguidas degradam a fonte uma vez: alerta à equipe e aviso a cada escritório', async () => {
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_B)));
    const [plano] = await planejar.executar(rodada());
    fonte.falhar = 'fora-do-ar';
    for (let i = 0; i < FALHAS_PARA_DEGRADAR + 1; i++) {
      await expect(executar.executar(plano)).rejects.toBeInstanceOf(ErroTransitorio);
    }
    expect(alertas).toEqual([`degradada falsa ${String(FALHAS_PARA_DEGRADAR)}`]);
    expect(repo.fontes.get('falsa')).toMatchObject({ situacao: 'degradada' });
    const avisos = await eventos();
    expect(avisos.map((e) => [e.tipo, e.tenantId])).toEqual(
      [TENANT_A, TENANT_B].sort().map((t) => ['FonteDegradada', t]),
    );
  });

  it('cota excedida não degrada a fonte; alvo com falhas seguidas gera o alerta específico uma vez', async () => {
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    const [plano] = await planejar.executar(rodada());
    fonte.falhar = 'cota';
    for (let i = 0; i < FALHAS_PARA_ALERTAR_ALVO + 1; i++) {
      await expect(executar.executar(plano)).rejects.toBeInstanceOf(ErroLimiteExcedido);
    }
    expect(alertas).toEqual([`alvo ${String(FALHAS_PARA_ALERTAR_ALVO)}`]);
    expect(repo.fontes.get('falsa')).toBeUndefined();
  });

  it('ao restabelecer: antecipa os alvos em recuo, avisa e a janela cobre a indisponibilidade', async () => {
    const relogioProprio = new FixedClock(Instant.deIso('2026-10-01T12:00:00Z'));
    const planejar2 = new PlanejarCaptura(outbox, repo, relogioProprio, {
      diasIniciais: 7,
      fonte: 'falsa',
    });
    const executar2 = new ExecutarCaptura(
      outbox,
      repo,
      fonte,
      outbox,
      relogioProprio,
      'falsa',
      alertasFalsos(),
    );
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    await emTx((tx) =>
      manter.processoMonitorado(tx, {
        tenantId: TENANT_A,
        payload: { processoId: gerarUuidV7(), numeroCnj: '1000004-06.2026.8.26.0100' },
      }),
    );
    const planos = await planejar2.executar(rodada());
    for (const p of planos) await executar2.executar(p);
    await eventos();
    const oabPlano = planos.find((p) => p.tipo === 'oab');
    // Três dias fora do ar: a OAB falha e fica em recuo; a fonte degrada.
    relogioProprio.definir(Instant.deIso('2026-10-04T12:00:00Z'));
    fonte.falhar = 'fora-do-ar';
    for (let i = 0; i < FALHAS_PARA_DEGRADAR; i++) {
      await expect(
        executar2.executar({ ...oabPlano, inicio: '2026-09-30', fim: '2026-10-04' }),
      ).rejects.toThrow();
    }
    await eventos();
    expect(await planejar2.executar(rodada())).toHaveLength(1); // só o processo, sem recuo
    // A fonte volta: o primeiro sucesso (processo) restabelece e antecipa a OAB.
    fonte.falhar = false;
    const [processo] = await planejar2.executar(rodada());
    await executar2.executar(processo);
    expect(alertas.at(-1)).toBe('restabelecida falsa 1');
    expect((await eventos()).map((e) => e.tipo)).toContain('FonteRestabelecida');
    const [recaptura] = await planejar2.executar(rodada());
    // Janela desde o último sucesso (01/10, com um dia de sobreposição) até hoje.
    expect(recaptura).toMatchObject({ tipo: 'oab', inicio: '2026-09-30', fim: '2026-10-04' });
    expect(repo.fontes.get('falsa')).toMatchObject({
      situacao: 'operacional',
      falhasConsecutivas: 0,
    });
  });

  it('status: fonte e OABs do escritório pela porta de leitura', async () => {
    const status = await new ConsultarStatusDaCaptura(
      outbox,
      {
        fonte: () =>
          Promise.resolve({
            id: 'falsa',
            situacao: 'degradada' as const,
            desde: null,
            proximaRodada: null,
          }),
        oabs: () => Promise.resolve([]),
      },
      'falsa',
      relogio,
    ).executar();
    expect(status).toEqual({
      fonte: { id: 'falsa', situacao: 'degradada', desde: null, proximaRodada: null },
      oabs: [],
    });
  });

  it('a mesma janela em outra rodada do dia entrega de novo (a 3ª busca do dia trazia nada)', async () => {
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    await executar.executar((await planejar.executar(rodada()))[0]);
    const [segunda] = await planejar.executar(rodada());
    const [terceira] = await planejar.executar(rodada());
    expect(segunda).toMatchObject({ inicio: terceira?.inicio, fim: terceira?.fim });
    expect(await executar.executar(segunda)).toMatchObject({ situacao: 'entregue' });
    expect(await executar.executar(terceira)).toMatchObject({ situacao: 'entregue' });
  });

  it('job enfileirado antes da rodada (sem ela) continua aceito', async () => {
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A)));
    const [plano] = await planejar.executar(rodada());
    if (plano === undefined) throw new Error('sem plano');
    const { alvoId, tipo, valor, inicio, fim } = plano;
    expect(await executar.executar({ alvoId, tipo, valor, inicio, fim })).toMatchObject({
      situacao: 'entregue',
    });
    expect(repo.alvos.get(plano.alvoId)?.ultimaChave).toBe(
      `${plano.alvoId}:${plano.inicio}:${plano.fim}`,
    );
  });

  it('próxima rodada: gravada pela fonte e mostrada no status', async () => {
    const quando = Instant.deIso('2026-10-07T14:00:00Z');
    await new RegistrarProximaRodada(outbox, repo, 'falsa').executar(quando);
    expect(repo.proximasRodadas.get('falsa')).toEqual(quando);
  });
});

describe('buscar agora', () => {
  const AUTOR = { tenantId: TENANT_A, usuarioId: gerarUuidV7(), canal: 'portal' as const };
  let auditoria: { tipo: string; entidadeId: string; usuarioId?: string }[];
  let solicitar: SolicitarBuscaAgora<unknown>;
  let relogioDaBusca: FixedClock;
  beforeEach(() => {
    auditoria = [];
    relogioDaBusca = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
    const trilha = {
      registrar: (
        _tx: unknown,
        e: { tipo: string; entidadeId: string },
        o: { usuarioId?: string },
      ) => {
        auditoria.push({ tipo: e.tipo, entidadeId: e.entidadeId, ...o });
        return Promise.resolve();
      },
    };
    solicitar = new SolicitarBuscaAgora(outbox, repo, trilha, outbox, relogioDaBusca);
  });

  it('o pedido grava a trilha e BuscaAgoraSolicitada; o plano usa o evento como rodada', async () => {
    const oabId = gerarUuidV7();
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A, oabId)));
    await eventos();
    const r = await solicitar.executar(AUTOR, { oabId });
    expect(r.ok).toBe(true);
    const [pedido] = await eventos();
    const alvoId = repo.alvo('oab', '123456/SP')?.id;
    expect(pedido).toMatchObject({
      tipo: 'BuscaAgoraSolicitada',
      tenantId: TENANT_A,
      payload: { alvoId, oabId },
    });
    expect(auditoria).toEqual([
      {
        tipo: 'captura.busca-solicitada',
        entidadeId: alvoId,
        canal: 'portal',
        usuarioId: AUTOR.usuarioId,
      },
    ]);

    const plano = await new PlanejarBuscaAgora(repo, relogioDaBusca, {
      diasIniciais: 7,
    }).aoSolicitar(undefined as never, pedido);
    expect(plano).toMatchObject({
      alvoId,
      inicio: '2026-09-30',
      fim: '2026-10-07',
      rodada: `agora-${String(pedido?.id)}`,
    });
    expect(await executar.executar(plano)).toMatchObject({ situacao: 'entregue' });
  });

  it('um pedido por OAB a cada 5 minutos, para todos os escritórios dela', async () => {
    const daA = gerarUuidV7();
    const daB = gerarUuidV7();
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A, daA)));
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_B, daB)));
    expect((await solicitar.executar(AUTOR, { oabId: daA })).ok).toBe(true);
    relogioDaBusca.avancarMs(4 * 60_000);
    const repetido = await solicitar.executar({ ...AUTOR, tenantId: TENANT_B }, { oabId: daB });
    expect(!repetido.ok && repetido.erro.codigo).toBe('busca-recente');

    const status = await new ConsultarStatusDaCaptura(
      outbox,
      {
        fonte: () =>
          Promise.resolve({
            id: 'falsa',
            situacao: 'operacional' as const,
            desde: null,
            proximaRodada: null,
          }),
        oabs: () =>
          Promise.resolve([
            {
              oabId: daA,
              oab: '123456/SP',
              ultimoSucesso: null,
              proximaExecucao: null,
              falhasConsecutivas: 0,
              ultimoPedido: repo.alvo('oab', '123456/SP')?.buscaSolicitadaEm ?? null,
            },
          ]),
      },
      'falsa',
      relogioDaBusca,
    ).executar();
    expect(status.oabs[0]?.buscaAgoraLiberadaEm?.paraIso()).toBe('2026-10-07T12:05:00.000Z');

    relogioDaBusca.avancarMs(60_000);
    expect((await solicitar.executar(AUTOR, { oabId: daA })).ok).toBe(true);
  });

  it('OAB que não é do escritório (ou id inválido) não é encontrada', async () => {
    const r = await solicitar.executar(AUTOR, { oabId: gerarUuidV7() });
    expect(!r.ok && r.erro.codigo).toBe('oab-nao-monitorada');
    const invalido = await solicitar.executar(AUTOR, { oabId: 'x' });
    expect(!invalido.ok && invalido.erro.codigo).toBe('oab-nao-monitorada');
  });

  it('alvo desativado depois do pedido: nada a buscar', async () => {
    const plano = await new PlanejarBuscaAgora(repo, relogio, { diasIniciais: 7 }).aoSolicitar(
      undefined as never,
      { id: gerarUuidV7(), payload: { alvoId: gerarUuidV7() } },
    );
    expect(plano).toBeUndefined();
  });

  it('pedido antigo não trava o botão; OAB de processo ou alvo inativo não é buscada', async () => {
    const oabId = gerarUuidV7();
    await emTx((tx) => manter.oabAdicionada(tx, oab(TENANT_A, oabId)));
    const alvo = repo.alvo('oab', '123456/SP');
    if (alvo === undefined) throw new Error('sem alvo');
    const status = (ultimoPedido: Instant | null) =>
      new ConsultarStatusDaCaptura(
        outbox,
        {
          fonte: () =>
            Promise.resolve({
              id: 'falsa',
              situacao: 'operacional' as const,
              desde: null,
              proximaRodada: null,
            }),
          oabs: () =>
            Promise.resolve([
              {
                oabId,
                oab: '123456/SP',
                ultimoSucesso: null,
                proximaExecucao: null,
                falhasConsecutivas: 0,
                ultimoPedido,
              },
            ]),
        },
        'falsa',
        relogioDaBusca,
      ).executar();
    const antigo = Instant.deIso('2026-10-07T11:00:00Z');
    expect((await status(antigo)).oabs[0]?.buscaAgoraLiberadaEm).toBeNull();
    expect((await status(null)).oabs[0]?.buscaAgoraLiberadaEm).toBeNull();

    alvo.ativo = false;
    const inativo = await solicitar.executar(AUTOR, { oabId });
    expect(!inativo.ok && inativo.erro.codigo).toBe('oab-nao-monitorada');
    expect(await repo.alvoPorId(undefined as never, alvo.id)).toBeUndefined();
    await repo.registrarPedido(undefined as never, gerarUuidV7(), relogio.agora());
  });
});
