import { ErroTransitorio } from '@pz/integracoes';
import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  DesativarAssinatura,
  EntregarWebhook,
  ListarAssinaturas,
  ListarEntregas,
  ReenviarEntrega,
  RegistrarAssinatura,
  RegistrarEntregas,
  TestarAssinatura,
} from '../application/webhooks.js';
import {
  desfechoDoStatus,
  enderecoDaAssinatura,
  eventoPublicoDe,
  eventosDaAssinatura,
} from '../domain/eventos-publicos.js';

import { CriptografiaNode } from './criptografia.js';
import { AssinaturasDeWebhookEmMemoria, EntregasDeWebhookEmMemoria } from './em-memoria.js';

import type { Autor } from '../application/portas.js';
import type { EntregaWebhook, ResultadoEntregaWebhook } from '@pz/integracoes';
import type { EventoDominio, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-11-06T12:00:00Z'));
const autor: Autor = { tenantId: gerarUuidV7(), usuarioId: gerarUuidV7(), canal: 'portal' };

function montar(respostas: ResultadoEntregaWebhook[] = []) {
  const unidade = new OutboxEmMemoria();
  const assinaturas = new AssinaturasDeWebhookEmMemoria();
  const entregas = new EntregasDeWebhookEmMemoria();
  const auditados: string[] = [];
  const enviados: EntregaWebhook[] = [];
  const deps = {
    unidade,
    assinaturas,
    entregas,
    outbox: unidade,
    trilha: {
      registrar: (_tx: unknown, entrada: { tipo: string; depois?: unknown }) => {
        auditados.push(entrada.tipo);
        return Promise.resolve();
      },
    },
    cifra: { cifrar: (t: string) => `cifrado:${t}`, decifrar: (c: string) => c.slice(8) },
    criptografia: new CriptografiaNode(),
    relogio,
  };
  const entregador = {
    entregar: (e: EntregaWebhook) => {
      enviados.push(e);
      return Promise.resolve(respostas.shift() ?? { tipo: 'resposta' as const, status: 200 });
    },
    saude: () => Promise.resolve({ estado: 'operacional' as const, verificadoEm: relogio.agora() }),
  };
  return {
    unidade,
    assinaturas,
    entregas,
    auditados,
    enviados,
    registrar: new RegistrarAssinatura(deps, true),
    listar: new ListarAssinaturas(deps),
    desativar: new DesativarAssinatura(deps),
    listarEntregas: new ListarEntregas(deps),
    registrarEntregas: new RegistrarEntregas(deps),
    testar: new TestarAssinatura(deps),
    reenviar: new ReenviarEntrega(deps),
    entregar: new EntregarWebhook(deps, entregador),
  };
}

const evento = (tipo: string, payload: Record<string, unknown>): EventoDominio => ({
  id: gerarUuidV7(),
  tipo,
  versao: 1,
  tenantId: autor.tenantId,
  agregadoId: gerarUuidV7(),
  ocorridoEm: relogio.agora(),
  payload,
});

async function comAssinatura(m: ReturnType<typeof montar>, eventos = ['prazo.confirmado']) {
  const r = await m.registrar.executar(autor, {
    url: 'https://erp.exemplo.invalid/webhooks',
    descricao: 'ERP fictício',
    eventos,
  });
  if (!r.ok) throw new Error('registrar falhou');
  return r.valor;
}

describe('catálogo de eventos públicos (HU49)', () => {
  it('mapeia o evento de domínio e leva só identificadores', () => {
    expect(
      eventoPublicoDe('PrazoConfirmado', {
        prazoId: 'p',
        processoId: 'q',
        usuarioId: 'u',
        vencimento: '2027-03-01',
      }),
    ).toEqual({ tipo: 'prazo.confirmado', dados: { prazoId: 'p', processoId: 'q' } });
    expect(eventoPublicoDe('PublicacaoRecebida', { conteudoId: 'c', processoId: null })).toEqual({
      tipo: 'publicacao.recebida',
      dados: { conteudoId: 'c', processoId: null },
    });
    expect(eventoPublicoDe('ContaBloqueada', {})).toBeUndefined();
  });

  it('valida eventos, endereço e desfecho do status', () => {
    expect(eventosDaAssinatura(['prazo.vencido', 'prazo.vencido'])).toEqual({
      ok: true,
      valor: ['prazo.vencido'],
    });
    expect(eventosDaAssinatura(['x']).ok).toBe(false);
    expect(eventosDaAssinatura([]).ok).toBe(false);
    expect(enderecoDaAssinatura('http://localhost:4000/x', false).ok).toBe(true);
    for (const url of ['http://exemplo.invalid', 'ftp://x', 'nada', 'https://u:s@x.invalid']) {
      expect(enderecoDaAssinatura(url, true).ok).toBe(false);
    }
    expect(enderecoDaAssinatura('ftp://x', false).ok).toBe(false);
    expect([200, 204, 400, 404, 408, 429, 500, 302].map(desfechoDoStatus)).toEqual([
      'entregue',
      'entregue',
      'recusada',
      'recusada',
      'tentar-de-novo',
      'tentar-de-novo',
      'tentar-de-novo',
      'tentar-de-novo',
    ]);
  });
});

describe('assinaturas de webhook (HU49)', () => {
  it('registra com segredo cifrado e mostrado uma vez; lista e desativa com trilha', async () => {
    const m = montar();
    const { assinatura, segredo } = await comAssinatura(m);
    expect(segredo).toMatch(/^whsec_/);
    expect(m.assinaturas.itens.get(assinatura.id)?.segredoCifrado).toBe(`cifrado:${segredo}`);
    expect(JSON.stringify(await m.listar.executar())).not.toContain(segredo);
    expect((await m.desativar.executar(autor, assinatura.id)).ok).toBe(true);
    const deNovo = await m.desativar.executar(autor, assinatura.id);
    expect(!deNovo.ok && deNovo.erro.codigo).toBe('assinatura-nao-encontrada');
    expect(m.auditados).toEqual([
      'webhooks.assinatura-registrada',
      'webhooks.assinatura-desativada',
    ]);
  });

  it('recusa entrada inválida, HTTP fora do local e evento desconhecido', async () => {
    const m = montar();
    const casos = [
      {},
      { url: 'http://erp.exemplo.invalid', descricao: 'x', eventos: ['prazo.vencido'] },
      { url: 'https://erp.exemplo.invalid', descricao: 'x', eventos: ['nao.existe'] },
    ];
    for (const entrada of casos) {
      expect((await m.registrar.executar(autor, entrada)).ok).toBe(false);
    }
    expect(m.auditados).toEqual([]);
  });
});

describe('entregas de webhook (HU49)', () => {
  it('evento vira entrega assinada, uma vez por assinatura; o integrador confere o HMAC', async () => {
    const m = montar();
    const { assinatura, segredo } = await comAssinatura(m);
    await comAssinatura(m, ['prazo.vencido']);
    const confirmado = evento('PrazoConfirmado', { prazoId: 'p1', processoId: 'q1' });
    const ids = await m.registrarEntregas.executar(null, confirmado);
    expect(ids).toHaveLength(1);
    expect(await m.registrarEntregas.executar(null, confirmado)).toEqual([]);
    expect(await m.registrarEntregas.executar(null, evento('ContaBloqueada', {}))).toEqual([]);

    const [id] = ids as [Uuid];
    expect(await m.entregar.executar(id)).toBe('entregue');
    const enviado = m.enviados[0];
    expect(enviado?.url).toBe(assinatura.url);
    expect(JSON.parse(enviado?.corpo ?? '')).toEqual({
      id: confirmado.id,
      tipo: 'prazo.confirmado',
      versao: 1,
      ocorridoEm: '2026-11-06T12:00:00.000Z',
      dados: { prazoId: 'p1', processoId: 'q1' },
    });
    const [t, v1] = (enviado?.cabecalhos['prejuzero-assinatura'] ?? '').split(',');
    const segundos = t?.slice(2) ?? '';
    expect(segundos).toBe(String(Date.parse('2026-11-06T12:00:00Z') / 1000));
    expect(v1).toBe(
      `v1=${new CriptografiaNode().hmac(segredo, `${segundos}.${enviado?.corpo ?? ''}`)}`,
    );
    expect(enviado?.cabecalhos['prejuzero-evento-id']).toBe(confirmado.id);
    // Já entregue: o job repetido não reenvia.
    expect(await m.entregar.executar(id)).toBe('ignorada');
    expect(m.enviados).toHaveLength(1);
    expect((await m.listarEntregas.executar({}))[0]).toMatchObject({
      situacao: 'entregue',
      tentativas: 1,
      ultimoStatus: 200,
      entregueEm: '2026-11-06T12:00:00.000Z',
    });
  });

  it('falha passageira tenta de novo; esgotada, vai para a fila de falhas e reenvia', async () => {
    const m = montar([
      { tipo: 'falha', motivo: 'timeout' },
      { tipo: 'resposta', status: 503 },
    ]);
    const { assinatura } = await comAssinatura(m);
    const [id] = (await m.registrarEntregas.executar(
      null,
      evento('PrazoConfirmado', { prazoId: 'p', processoId: 'q' }),
    )) as [Uuid];
    await expect(m.entregar.executar(id)).rejects.toBeInstanceOf(ErroTransitorio);
    await expect(m.entregar.executar(id)).rejects.toThrow('HTTP 503');
    await m.entregar.esgotar(id, 'tentativas esgotadas');
    const falha = (await m.listarEntregas.executar({ assinaturaId: assinatura.id }))[0];
    expect(falha).toMatchObject({ situacao: 'falhou', tentativas: 2, ultimoErro: 'HTTP 503' });

    expect((await m.reenviar.executar(autor, id)).ok).toBe(true);
    expect(m.unidade.pendentes().map((e) => e.tipo)).toEqual(['EntregaWebhookAgendada']);
    const deNovo = await m.reenviar.executar(autor, id);
    expect(!deNovo.ok && deNovo.erro.codigo).toBe('entrega-nao-falhou');
    const inexistente = await m.reenviar.executar(autor, gerarUuidV7());
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('entrega-nao-encontrada');
    expect(await m.entregar.executar(id)).toBe('entregue');
    // Esgotar depois de entregue não muda nada.
    await m.entregar.esgotar(id, 'x');
    expect((await m.listarEntregas.executar({ limite: 1 }))[0]?.situacao).toBe('entregue');
  });

  it('recusa do integrador (4xx) não repete; desativada é ignorada; ainda não gravada repete', async () => {
    const m = montar([{ tipo: 'resposta', status: 410 }]);
    const { assinatura } = await comAssinatura(m, ['prazo.vencido', 'prazo.cumprido']);
    const [recusada] = (await m.registrarEntregas.executar(
      null,
      evento('PrazoVencido', { prazoId: 'p', processoId: 'q' }),
    )) as [Uuid];
    expect(await m.entregar.executar(recusada)).toBe('recusada');
    expect((await m.listarEntregas.executar({}))[0]?.situacao).toBe('falhou');

    const [outra] = (await m.registrarEntregas.executar(
      null,
      evento('PrazoCumprido', { prazoId: 'p', processoId: 'q' }),
    )) as [Uuid];
    await m.desativar.executar(autor, assinatura.id);
    expect(await m.entregar.executar(outra)).toBe('ignorada');
    await expect(m.entregar.executar(gerarUuidV7())).rejects.toBeInstanceOf(ErroTransitorio);
  });

  it('testar cria a entrega webhook.teste e agenda; desativada ou inexistente não', async () => {
    const m = montar();
    const { assinatura } = await comAssinatura(m);
    const teste = await m.testar.executar(autor, assinatura.id);
    expect(teste.ok && teste.valor).toMatchObject({ tipo: 'webhook.teste', situacao: 'pendente' });
    expect(m.unidade.pendentes().map((e) => e.tipo)).toEqual(['EntregaWebhookAgendada']);
    const inexistente = await m.testar.executar(autor, gerarUuidV7());
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('assinatura-nao-encontrada');
    await m.desativar.executar(autor, assinatura.id);
    const desativada = await m.testar.executar(autor, assinatura.id);
    expect(!desativada.ok && desativada.erro.codigo).toBe('assinatura-desativada');
  });
});
