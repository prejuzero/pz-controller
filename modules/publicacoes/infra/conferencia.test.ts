import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConferirPublicacao } from '../application/conferencia.js';

import type {
  DecisaoDaConferencia,
  PublicacaoDoTenant,
  RepositorioDeLeitura,
  RepositorioDePublicacoes,
} from '../application/portas.js';
import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Publicação FICTÍCIA capturada pelo nome do escritório.
const relogio = new FixedClock(Instant.deIso('2026-11-08T12:00:00Z'));
const TENANT = gerarUuidV7();
const USUARIO = gerarUuidV7();
const PROCESSO = gerarUuidV7();
const ID = gerarUuidV7();

function montar(conferencia: PublicacaoDoTenant['conferencia'], numeroCnj: string | null) {
  const decisoes: DecisaoDaConferencia[] = [];
  const tipos: string[] = [];
  const criados: string[] = [];
  let atual = conferencia;
  const leitura = {
    buscar: () =>
      Promise.resolve({
        id: ID,
        numeroCnj,
        dataDisponibilizacao: '2026-11-06',
        conferencia: atual,
      } as PublicacaoDoTenant),
  } as unknown as RepositorioDeLeitura<TransacaoEmMemoria>;
  const publicacoes = {
    conferir: (_tx: unknown, _t: Uuid, _id: Uuid, d: DecisaoDaConferencia) => {
      if (atual !== 'pendente') return Promise.resolve(false);
      decisoes.push(d);
      atual = 'confirmada';
      return Promise.resolve(true);
    },
  } as unknown as RepositorioDePublicacoes<TransacaoEmMemoria>;
  const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
    registrar: (tx, entrada: EntradaDeAuditoria) => {
      tx.aoConfirmar(() => tipos.push(entrada.tipo));
      return Promise.resolve();
    },
  };
  const outbox = new OutboxEmMemoria();
  const conferir = new ConferirPublicacao(
    outbox,
    leitura,
    publicacoes,
    (_t, numero) => {
      criados.push(numero);
      return Promise.resolve(PROCESSO);
    },
    trilha,
    outbox,
    relogio,
  );
  const conferente = { tenantId: TENANT, usuarioId: USUARIO, canal: 'portal' as const };
  return { conferir, conferente, decisoes, tipos, criados, outbox };
}

describe('conferência da publicação capturada pelo nome (HU42)', () => {
  it('confirmar cria o processo, registra quem decidiu e segue como recebida', async () => {
    const m = montar('pendente', '10000040620268260100');
    expect(await m.conferir.executar(m.conferente, ID, { decisao: 'confirmar' })).toEqual({
      ok: true,
      valor: undefined,
    });
    expect(m.criados).toEqual(['10000040620268260100']);
    expect(m.decisoes).toEqual([
      expect.objectContaining({ conferencia: 'confirmada', processoId: PROCESSO, por: USUARIO }),
    ]);
    expect(m.tipos).toEqual(['publicacoes.publicacao-confirmada']);
    expect(m.outbox.pendentes()).toEqual([
      expect.objectContaining({
        tipo: 'PublicacaoRecebida',
        payload: { conteudoId: ID, processoId: PROCESSO, dataDisponibilizacao: '2026-11-06' },
      }),
    ]);
    // A segunda decisão é recusada.
    expect(await m.conferir.executar(m.conferente, ID, { decisao: 'descartar' })).toMatchObject({
      ok: false,
      erro: { codigo: 'publicacao-ja-conferida' },
    });
  });

  it('descartar não cria processo nem evento; sem número, confirmar segue sem processo', async () => {
    const d = montar('pendente', null);
    expect((await d.conferir.executar(d.conferente, ID, { decisao: 'descartar' })).ok).toBe(true);
    expect(d.decisoes[0]).toMatchObject({ conferencia: 'descartada', processoId: null });
    expect(d.tipos).toEqual(['publicacoes.publicacao-descartada']);
    expect(d.outbox.pendentes()).toEqual([]);

    const c = montar('pendente', null);
    expect((await c.conferir.executar(c.conferente, ID, { decisao: 'confirmar' })).ok).toBe(true);
    expect(c.criados).toEqual([]);
  });

  it('recusa decisão inválida, publicação que não espera conferência e corrida', async () => {
    const m = montar(null, null);
    expect(await m.conferir.executar(m.conferente, ID, { decisao: 'talvez' })).toMatchObject({
      ok: false,
      erro: { categoria: 'validacao' },
    });
    expect(await m.conferir.executar(m.conferente, ID, { decisao: 'confirmar' })).toMatchObject({
      ok: false,
      erro: { codigo: 'publicacao-ja-conferida' },
    });
    const vazia = new ConferirPublicacao(
      new OutboxEmMemoria(),
      {
        buscar: () => Promise.resolve(undefined),
      } as unknown as RepositorioDeLeitura<TransacaoEmMemoria>,
      {} as RepositorioDePublicacoes<TransacaoEmMemoria>,
      () => Promise.reject(new Error('não usado')),
      { registrar: () => Promise.resolve() },
      new OutboxEmMemoria(),
      relogio,
    );
    expect(await vazia.executar(m.conferente, ID, { decisao: 'confirmar' })).toMatchObject({
      ok: false,
      erro: { codigo: 'publicacao-inexistente' },
    });
  });
});
