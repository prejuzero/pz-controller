import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  AutorizarCliente,
  DescreverAutorizacao,
  TrocarCodigoPorTokens,
} from '../application/autorizacao-oauth.js';
import { ConsultarPermissoes } from '../application/autorizacao.js';
import {
  EmitirTokenDeCliente,
  RegistrarClienteOAuth,
  RevogarClienteOAuth,
} from '../application/clientes-oauth.js';
import { RenovarTokens } from '../application/dispositivos.js';
import { ValidarSessao } from '../application/sessoes.js';
import { enderecosDeRetorno } from '../domain/cliente-oauth.js';

import {
  ClientesOAuthEmMemoria,
  CodigosEmMemoria,
  DispositivosEmMemoria,
  PerfisEmMemoria,
  PublicadorEmMemoria,
  RenovacoesEmMemoria,
  SessoesEmMemoria,
} from './em-memoria.js';
import { desafioPkce } from './tokens.js';

import type { PedidoDeAutorizacao } from '../application/autorizacao-oauth.js';
import type { Sessao } from '../domain/sessao.js';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS. O desafio foi calculado à parte (Python: base64url(sha256(verificador))).
const relogio = new FixedClock(Instant.deIso('2026-11-06T12:00:00Z'));
const VERIFICADOR = 'dBjftJeZ4CVP-mJ92K5qWkqvq2H0pz8cZ9ZvB3dlHhM';
const DESAFIO = '_VJYCE39nEYLiJaku8lHE65wmBtjgKK66fRsbWRLAj8';
const RETORNO = 'http://localhost:8765/retorno';

function montar() {
  const clientes = new ClientesOAuthEmMemoria();
  const sessoes = new SessoesEmMemoria();
  const dispositivos = new DispositivosEmMemoria();
  const renovacoes = new RenovacoesEmMemoria();
  const codigos = new CodigosEmMemoria();
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
    dispositivos,
    publicador,
    permissoes,
    validar: new ValidarSessao(sessoes, relogio),
    registrar: new RegistrarClienteOAuth(clientes, permissoes, tokens, publicador, relogio),
    descrever: new DescreverAutorizacao(clientes, permissoes),
    autorizar: new AutorizarCliente(clientes, permissoes, codigos, tokens, publicador, relogio),
    trocar: new TrocarCodigoPorTokens(
      clientes,
      codigos,
      desafioPkce,
      dispositivos,
      sessoes,
      renovacoes,
      tokens,
      publicador,
      relogio,
      noTenant,
    ),
    renovar: new RenovarTokens(
      dispositivos,
      sessoes,
      renovacoes,
      tokens,
      publicador,
      relogio,
      noTenant,
    ),
    revogar: new RevogarClienteOAuth(
      clientes,
      sessoes,
      dispositivos,
      renovacoes,
      publicador,
      relogio,
    ),
    credenciais: new EmitirTokenDeCliente(clientes, sessoes, tokens, relogio, noTenant),
  };
}

async function comApp(m: ReturnType<typeof montar>) {
  const r = await m.registrar.executar(m.sessao, {
    nome: 'Assistente fictício',
    escopos: ['prazos:ler', 'publicacoes:ler'],
    tipo: 'publico',
    redirectUris: [RETORNO],
  });
  if (!r.ok) throw new Error('registrar falhou');
  return r.valor.cliente.id;
}

const pedido = (clienteId: Uuid, extra: Partial<PedidoDeAutorizacao> = {}) => ({
  responseType: 'code',
  clienteId,
  redirectUri: RETORNO,
  escopo: 'prazos:ler',
  estado: 'xyz',
  desafio: DESAFIO,
  metodoDoDesafio: 'S256',
  ...extra,
});

describe('endereços de retorno e PKCE (HU49)', () => {
  it('HTTPS ou loopback, sem fragmento nem credencial, de 1 a 5', () => {
    expect(enderecosDeRetorno(['https://app.exemplo.invalid/cb', ` ${RETORNO} `]).ok).toBe(true);
    for (const uris of [
      [],
      ['http://app.exemplo.invalid/cb'],
      ['https://app.exemplo.invalid/cb#x'],
      ['https://u:s@app.exemplo.invalid/cb'],
      ['nao é url'],
      [
        'https://a.invalid/1',
        'https://a.invalid/2',
        'https://a.invalid/3',
        'https://a.invalid/4',
        'https://a.invalid/5',
        'https://a.invalid/6',
      ],
    ]) {
      expect(enderecosDeRetorno(uris).ok).toBe(false);
    }
    expect(desafioPkce(VERIFICADOR)).toBe(DESAFIO);
  });
});

describe('Authorization Code + PKCE (HU49)', () => {
  it('app público sem segredo; consentimento, código de uso único e tokens nos escopos', async () => {
    const m = montar();
    const id = await comApp(m);
    const registrado = (await m.clientes.listar())[0];
    expect(registrado).toMatchObject({ tipo: 'publico', redirectUris: [RETORNO] });

    const descricao = await m.descrever.executar(m.sessao, pedido(id));
    expect(descricao.ok && descricao.valor).toMatchObject({
      cliente: { id, nome: 'Assistente fictício' },
      escopos: [{ escopo: 'prazos:ler' }],
    });
    const autorizado = await m.autorizar.executar(m.sessao, pedido(id));
    if (!autorizado.ok) throw new Error('autorizar falhou');
    const destino = new URL(autorizado.valor.redirecionarPara);
    expect(`${destino.origin}${destino.pathname}`).toBe(RETORNO);
    expect(destino.searchParams.get('state')).toBe('xyz');
    const codigo = destino.searchParams.get('code') ?? '';
    expect(m.publicador.publicados.map((e) => e.tipo)).toContain('ClienteOAuthAutorizado');

    const tokens = await m.trocar.executar({
      codigo,
      clienteId: id,
      redirectUri: RETORNO,
      verificador: VERIFICADOR,
    });
    if (!tokens.ok) throw new Error('troca falhou');
    expect(tokens.valor.escopos).toEqual(['prazos:ler']);
    const sessao = await m.validar.executar(tokens.valor.tokenDeAcesso);
    expect(sessao.ok && sessao.valor).toMatchObject({
      usuarioId: m.sessao.usuarioId,
      escopos: ['prazos:ler'],
    });
    const [dispositivo] = await m.dispositivos.listar(m.sessao.usuarioId);
    expect(dispositivo).toMatchObject({ clienteOAuthId: id, nome: 'Assistente fictício' });
    // O código vale uma vez.
    const deNovo = await m.trocar.executar({
      codigo,
      clienteId: id,
      redirectUri: RETORNO,
      verificador: VERIFICADOR,
    });
    expect(!deNovo.ok && deNovo.erro.codigo).toBe('invalid_grant');

    // Renovação rotativa só pelo mesmo cliente, mantendo os escopos.
    const renovado = await m.renovar.executar(tokens.valor.tokenDeRenovacao, id);
    if (!renovado.ok) throw new Error('renovar falhou');
    const depois = await m.validar.executar(renovado.valor.tokenDeAcesso);
    expect(depois.ok && depois.valor.escopos).toEqual(['prazos:ler']);
    const porOutro = await m.renovar.executar(renovado.valor.tokenDeRenovacao);
    expect(porOutro.ok).toBe(false);

    // Revogar o app derruba as sessões que nasceram das autorizações.
    const outra = await m.autorizar.executar(m.sessao, pedido(id));
    if (!outra.ok) throw new Error('autorizar falhou');
    const segundo = await m.trocar.executar({
      codigo: new URL(outra.valor.redirecionarPara).searchParams.get('code') ?? '',
      clienteId: id,
      redirectUri: RETORNO,
      verificador: VERIFICADOR,
    });
    if (!segundo.ok) throw new Error('troca falhou');
    expect((await m.revogar.executar(m.sessao, id)).ok).toBe(true);
    expect((await m.validar.executar(segundo.valor.tokenDeAcesso)).ok).toBe(false);
    expect((await m.renovar.executar(segundo.valor.tokenDeRenovacao, id)).ok).toBe(false);
    expect((await m.descrever.executar(m.sessao, pedido(id))).ok).toBe(false);
  });

  it('o pedido errado não passa da tela de consentimento', async () => {
    const m = montar();
    const id = await comApp(m);
    const codigo = async (sessao: Sessao, p: PedidoDeAutorizacao) => {
      const r = await m.descrever.executar(sessao, p);
      return r.ok ? 'ok' : r.erro.codigo;
    };
    expect(await codigo(m.sessao, pedido(gerarUuidV7()))).toBe('invalid_client');
    expect(await codigo(m.sessao, pedido(id, { redirectUri: `${RETORNO}/outro` }))).toBe(
      'invalid_request',
    );
    expect(await codigo(m.sessao, pedido(id, { responseType: 'token' }))).toBe(
      'unsupported_response_type',
    );
    expect(await codigo(m.sessao, pedido(id, { metodoDoDesafio: 'plain' }))).toBe(
      'invalid_request',
    );
    expect(await codigo(m.sessao, pedido(id, { desafio: 'curto' }))).toBe('invalid_request');
    expect(await codigo(m.sessao, pedido(id, { escopo: 'processos:gerir' }))).toBe('invalid_scope');
    // Colaborador não tem `relatorios:exportar` e o app não tem `processos:ler`.
    expect(await codigo(m.sessao, pedido(id, { escopo: 'processos:ler' }))).toBe('invalid_scope');
    const deApp = { ...m.sessao, dispositivoId: gerarUuidV7() };
    expect(await codigo(deApp, pedido(id))).toBe('autorizacao-so-no-portal');
    const autorizado = await m.autorizar.executar(deApp, pedido(id));
    expect(autorizado.ok).toBe(false);
    // Integração confidencial não é app de consentimento.
    const confidencial = await m.registrar.executar(m.sessao, {
      nome: 'ERP',
      escopos: ['prazos:ler'],
    });
    if (!confidencial.ok) throw new Error('registrar falhou');
    expect(await codigo(m.sessao, pedido(confidencial.valor.cliente.id))).toBe('invalid_client');
  });

  it('a troca confere cliente, endereço, verificador e app ativo; o público não usa segredo', async () => {
    const m = montar();
    const id = await comApp(m);
    const emitirCodigo = async () => {
      const r = await m.autorizar.executar(m.sessao, pedido(id));
      if (!r.ok) throw new Error('autorizar falhou');
      return new URL(r.valor.redirecionarPara).searchParams.get('code') ?? '';
    };
    const base = { clienteId: id, redirectUri: RETORNO, verificador: VERIFICADOR };
    for (const errado of [
      { clienteId: gerarUuidV7() },
      { redirectUri: `${RETORNO}/x` },
      { verificador: 'A'.repeat(43) },
      { verificador: 'curto' },
    ]) {
      const r = await m.trocar.executar({ ...base, ...errado, codigo: await emitirCodigo() });
      expect(!r.ok && r.erro.codigo).toBe('invalid_grant');
    }
    const pendente = await emitirCodigo();
    await m.revogar.executar(m.sessao, id);
    const revogado = await m.trocar.executar({ ...base, codigo: pendente });
    expect(!revogado.ok && revogado.erro.codigo).toBe('invalid_client');
    const credenciais = await m.credenciais.executar({ clienteId: id, segredo: 'x'.repeat(43) });
    expect(!credenciais.ok && credenciais.erro.codigo).toBe('invalid_client');
    const semRetorno = await m.registrar.executar(m.sessao, {
      nome: 'x',
      escopos: ['prazos:ler'],
      tipo: 'publico',
      redirectUris: ['http://app.exemplo.invalid/cb'],
    });
    expect(!semRetorno.ok && semRetorno.erro.codigo).toBe('validacao');
  });
});
