import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import { AvisarSituacaoDaFonte } from '../application/avisos-da-fonte.js';
import { Notificar } from '../application/notificacoes.js';

import { ConsentimentosEmMemoria, NotificacoesEmMemoria } from './em-memoria.js';

import type { SituacaoDaFonte } from '../application/avisos-da-fonte.js';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS (e-mails reservados .invalid).
const relogio = new FixedClock(Instant.deIso('2026-10-08T12:00:00Z'));
const TENANT = gerarUuidV7();
const GESTORA = gerarUuidV7();
const GESTOR = gerarUuidV7();

describe('aviso de fonte degradada ou restabelecida (PZ-311)', () => {
  let repositorio: NotificacoesEmMemoria;
  let outbox: OutboxEmMemoria;
  let responsaveis: Uuid[];
  let avisarFonte: AvisarSituacaoDaFonte<TransacaoEmMemoria>;
  const avisar = (s: SituacaoDaFonte) => outbox.executar((tx) => avisarFonte.executar(tx, s));

  beforeEach(() => {
    repositorio = new NotificacoesEmMemoria();
    outbox = new OutboxEmMemoria();
    responsaveis = [GESTORA, GESTOR];
    const notificar = new Notificar(
      repositorio,
      { ativo: () => Promise.resolve(undefined) },
      { emails: (_tx, id) => Promise.resolve({ principal: `${id}@exemplo.invalid`, copias: [] }) },
      { suprimidos: () => Promise.resolve(new Set()), suprimir: () => Promise.resolve() },
      new ConsentimentosEmMemoria(),
      outbox,
      relogio,
    );
    avisarFonte = new AvisarSituacaoDaFonte(
      notificar,
      { usuarios: () => Promise.resolve(responsaveis) },
      'https://app.exemplo.invalid',
    );
  });

  const situacao = (
    s: 'degradada' | 'restabelecida',
    eventoId = gerarUuidV7(),
  ): SituacaoDaFonte => ({
    eventoId,
    tenantId: TENANT,
    fonte: 'djen',
    situacao: s,
    // 03:05 em UTC = 00:05 em São Paulo: o horário exibido é o do fuso do sistema.
    ocorridoEm: Instant.deIso('2026-10-08T03:05:00Z'),
  });

  it('degradada: um e-mail a cada responsável, com o horário de São Paulo e a página da cobertura', async () => {
    expect(await avisar(situacao('degradada'))).toBe(2);
    const todas = repositorio.todas();
    expect(todas.map((n) => n.usuarioId).sort()).toEqual([GESTORA, GESTOR].sort());
    for (const n of todas) {
      expect(n.tipo).toBe('fonte-degradada');
      expect(n.dados).toEqual({
        fonte: 'DJEN',
        desde: '08/10/2026 00:05',
        link: 'https://app.exemplo.invalid/configuracoes/cobertura',
      });
    }
    expect(outbox.pendentes().filter((e) => e.tipo === 'NotificacaoSolicitada')).toHaveLength(2);
  });

  it('restabelecida: usa o template de retorno', async () => {
    expect(await avisar(situacao('restabelecida'))).toBe(2);
    expect(repositorio.todas()[0]?.tipo).toBe('fonte-restabelecida');
    expect(repositorio.todas()[0]?.dados).toMatchObject({ em: '08/10/2026 00:05' });
  });

  it('o mesmo evento reprocessado não avisa de novo; um evento novo avisa', async () => {
    const eventoId = gerarUuidV7();
    await avisar(situacao('degradada', eventoId));
    expect(await avisar(situacao('degradada', eventoId))).toBe(0);
    expect(await avisar(situacao('degradada'))).toBe(2);
    expect(repositorio.todas()).toHaveLength(4);
  });

  it('escritório sem responsável não pede aviso (quem chama registra)', async () => {
    responsaveis = [];
    expect(await avisar(situacao('degradada'))).toBe(0);
  });

  it('dados fora do template são defeito: lança (DLQ) em vez de seguir calado', async () => {
    await expect(avisar({ ...situacao('degradada'), fonte: '' })).rejects.toThrow();
    expect(repositorio.todas()).toEqual([]);
  });
});
