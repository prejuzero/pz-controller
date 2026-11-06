import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsultarPermissoes } from '../application/autorizacao.js';
import {
  EmitirTokenDeCliente,
  ListarClientesOAuth,
  RegistrarClienteOAuth,
  RevogarClienteOAuth,
} from '../application/clientes-oauth.js';
import { ValidarSessao } from '../application/sessoes.js';
import { escoposDoCliente, escoposDoToken } from '../domain/cliente-oauth.js';

import {
  ClientesOAuthEmMemoria,
  PerfisEmMemoria,
  PublicadorEmMemoria,
  SessoesEmMemoria,
} from './em-memoria.js';

import type { Sessao } from '../domain/sessao.js';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-11-06T12:00:00Z'));

function montar() {
  const clientes = new ClientesOAuthEmMemoria();
  const sessoes = new SessoesEmMemoria();
  const publicador = new PublicadorEmMemoria();
  const perfis = new PerfisEmMemoria();
  const permissoes = new ConsultarPermissoes(perfis, () => undefined);
  let n = 0;
  const tokens = { novoToken: () => `token-ficticio-${String(++n).padStart(3, '0')}` };
  const noTenant = <R>(_t: string, trabalho: () => Promise<R>) => trabalho();
  const sessao: Sessao = {
    id: gerarUuidV7(),
    usuarioId: gerarUuidV7(),
    tenantId: gerarUuidV7(),
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: relogio.agora(),
    ultimoUso: relogio.agora(),
  };
  perfis.atribuir(sessao.usuarioId, 'colaborador');
  return {
    sessao,
    clientes,
    sessoes,
    perfis,
    publicador,
    permissoes,
    validar: new ValidarSessao(sessoes, relogio),
    registrar: new RegistrarClienteOAuth(clientes, permissoes, tokens, publicador, relogio),
    listar: new ListarClientesOAuth(clientes),
    revogar: new RevogarClienteOAuth(clientes, sessoes, publicador, relogio),
    emitir: new EmitirTokenDeCliente(clientes, sessoes, tokens, relogio, noTenant),
  };
}

describe('escopos do cliente OAuth (HU49)', () => {
  const doUsuario = new Set(['prazos:ler', 'prazos:confirmar'] as const);

  it('só leitura, só do catálogo e só o que o usuário tem', () => {
    expect(escoposDoCliente(['prazos:ler', 'prazos:ler'], doUsuario)).toEqual({
      ok: true,
      valor: ['prazos:ler'],
    });
    const r = escoposDoCliente(['prazos:confirmar', 'nada:x', 'publicacoes:ler'], doUsuario);
    expect(!r.ok && r.erro.problemas.map((d) => d.mensagem)).toEqual([
      'Integrações só recebem escopos de leitura: prazos:confirmar.',
      'Escopo desconhecido: nada:x.',
      'Você não tem a permissão publicacoes:ler.',
    ]);
    expect(escoposDoCliente([], doUsuario).ok).toBe(false);
  });

  it('o token pede todos ou um subconjunto (RFC 6749, seção 3.3)', () => {
    expect(escoposDoToken(undefined, ['a', 'b'])).toEqual(['a', 'b']);
    expect(escoposDoToken('  ', ['a'])).toEqual(['a']);
    expect(escoposDoToken('b  b', ['a', 'b'])).toEqual(['b']);
    expect(escoposDoToken('c', ['a'])).toBeUndefined();
  });
});

describe('clientes OAuth: Client Credentials (HU49)', () => {
  it('registra, emite token com as permissões dos escopos e audita por evento', async () => {
    const m = montar();
    const r = await m.registrar.executar(m.sessao, {
      nome: '  ERP fictício ',
      escopos: ['prazos:ler'],
    });
    if (!r.ok) throw new Error('falhou');
    expect(r.valor.cliente).toMatchObject({ nome: 'ERP fictício', escopos: ['prazos:ler'] });
    expect(m.publicador.publicados[0]).toMatchObject({
      tipo: 'ClienteOAuthRegistrado',
      payload: { clienteId: r.valor.cliente.id, escopos: 'prazos:ler' },
    });
    // O segredo nunca sai de novo: a listagem não o tem.
    expect(JSON.stringify(await m.listar.executar())).not.toContain(r.valor.segredo);

    const token = await m.emitir.executar({
      clienteId: r.valor.cliente.id,
      segredo: r.valor.segredo,
    });
    if (!token.ok) throw new Error('falhou');
    expect(token.valor.escopos).toEqual(['prazos:ler']);
    expect(token.valor.expiraEm.epochMs - relogio.agora().epochMs).toBe(15 * 60_000);
    const sessao = await m.validar.executar(token.valor.tokenDeAcesso);
    if (!sessao.ok) throw new Error('falhou');
    expect(sessao.valor).toMatchObject({ usuarioId: m.sessao.usuarioId, escopos: ['prazos:ler'] });
    expect([...(await m.permissoes.executar(sessao.valor))]).toEqual(['prazos:ler']);
    expect((await m.listar.executar())[0]?.ultimoUso).toEqual(relogio.agora());
  });

  it('o dono perde a permissão: o token do cliente perde junto', async () => {
    const m = montar();
    const sessao: Sessao = { ...m.sessao, escopos: ['prazos:ler'], usuarioId: gerarUuidV7() };
    expect([...(await m.permissoes.executar(sessao))]).toEqual([]);
  });

  it('recusa segredo errado, escopo não concedido, revogado e escritório suspenso', async () => {
    const m = montar();
    const r = await m.registrar.executar(m.sessao, { nome: 'BI', escopos: ['publicacoes:ler'] });
    if (!r.ok) throw new Error('falhou');
    const id = r.valor.cliente.id;
    const codigo = async (entrada: Parameters<typeof m.emitir.executar>[0]) => {
      const t = await m.emitir.executar(entrada);
      return t.ok ? 'ok' : t.erro.codigo;
    };
    expect(await codigo({ clienteId: id, segredo: 'errado' })).toBe('invalid_client');
    expect(await codigo({ clienteId: gerarUuidV7(), segredo: r.valor.segredo })).toBe(
      'invalid_client',
    );
    expect(await codigo({ clienteId: id, segredo: r.valor.segredo, escopo: 'prazos:ler' })).toBe(
      'invalid_scope',
    );
    const emitido = await m.emitir.executar({ clienteId: id, segredo: r.valor.segredo });
    m.clientes.tenantsSuspensos.add(m.sessao.tenantId);
    expect(await codigo({ clienteId: id, segredo: r.valor.segredo })).toBe('invalid_client');
    m.clientes.tenantsSuspensos.clear();

    expect((await m.revogar.executar(m.sessao, id)).ok).toBe(true);
    expect(m.publicador.publicados.at(-1)?.tipo).toBe('ClienteOAuthRevogado');
    // Revogar derruba na hora o token já emitido.
    if (!emitido.ok) throw new Error('falhou');
    expect((await m.validar.executar(emitido.valor.tokenDeAcesso)).ok).toBe(false);
    expect(await codigo({ clienteId: id, segredo: r.valor.segredo })).toBe('invalid_client');
    const deNovo = await m.revogar.executar(m.sessao, id);
    expect(!deNovo.ok && deNovo.erro.codigo).toBe('cliente-nao-encontrado');
    expect(await m.clientes.autenticar('nao-existe' as Uuid, 'x')).toBeUndefined();
  });

  it('não registra com escopo de escrita', async () => {
    const m = montar();
    m.perfis.atribuir(m.sessao.usuarioId, 'advogado');
    const r = await m.registrar.executar(m.sessao, { nome: 'x', escopos: ['prazos:confirmar'] });
    expect(!r.ok && r.erro.codigo).toBe('validacao');
    expect(m.publicador.publicados).toEqual([]);
  });
});
