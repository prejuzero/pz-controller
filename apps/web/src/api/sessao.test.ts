import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { chaves } from './chaves';
import { criarCliente } from './cliente';
import { consultasSessao, mutacoesSessao } from './sessao';

const sessao = {
  usuarioId: '0199a000-0000-7000-8000-000000000001',
  tenantId: '0199a000-0000-7000-8000-000000000002',
  nivel: 'completo',
  proximoPasso: null,
  permissoes: [],
};

function montar(corpo: unknown, status = 200) {
  const requisicoes: Request[] = [];
  const api = criarCliente({
    baseUrl: 'http://localhost',
    lerCookies: () => '',
    fetch: (requisicao) => {
      requisicoes.push(requisicao);
      return Promise.resolve(
        corpo === null
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify(corpo), {
              status,
              headers: { 'content-type': 'application/json' },
            }),
      );
    },
  });
  const cache = new QueryClient();
  return { api, cache, requisicoes, mutacoes: mutacoesSessao(api, cache) };
}

const caminho = (requisicao: Request | undefined) =>
  `${requisicao?.method ?? ''} ${new URL(requisicao?.url ?? 'http://x').pathname}`;

describe('sessão (HU06)', () => {
  it('entrar e verificar o 2FA guardam a sessão devolvida', async () => {
    const { cache, requisicoes, mutacoes } = montar(sessao);
    const resposta = await mutacoes.entrar.mutationFn({ email: 'a@b.c', senha: 'x' });
    mutacoes.entrar.onSuccess(resposta);
    expect(cache.getQueryData(chaves.sessao.atual())).toEqual(sessao);
    await mutacoes.verificarSegundoFator.mutationFn({ codigo: '123456' });
    expect(requisicoes.map(caminho)).toEqual([
      'POST /v1/auth/entrar',
      'POST /v1/auth/2fa/verificar',
    ]);
    expect(await requisicoes[0]?.json()).toEqual({ email: 'a@b.c', senha: 'x' });
  });

  it('ativar o 2FA guarda a sessão completa', async () => {
    const codigos = Array.from({ length: 10 }, (_, i) => `AAAAA-0000${String(i)}`);
    const { cache, mutacoes } = montar({ sessao, codigosDeRecuperacao: codigos });
    const resposta = await mutacoes.ativarSegundoFator.mutationFn({ codigo: '123456' });
    mutacoes.ativarSegundoFator.onSuccess(resposta);
    expect(cache.getQueryData(chaves.sessao.atual())).toEqual(sessao);
    expect(resposta.codigosDeRecuperacao).toHaveLength(10);
  });

  it('configura o 2FA, pede e redefine a senha', async () => {
    const { requisicoes, mutacoes } = montar({ uri: 'otpauth://totp/x', segredo: 'ABC' });
    await expect(mutacoes.configurarSegundoFator.mutationFn()).resolves.toEqual({
      uri: 'otpauth://totp/x',
      segredo: 'ABC',
    });
    const vazio = montar(null);
    await vazio.mutacoes.solicitarRedefinicao.mutationFn({ email: 'a@b.c' });
    await vazio.mutacoes.redefinirSenha.mutationFn({ token: 't'.repeat(20), novaSenha: 'n' });
    expect([...requisicoes, ...vazio.requisicoes].map(caminho)).toEqual([
      'POST /v1/auth/2fa/configurar',
      'POST /v1/auth/senha/esqueci',
      'POST /v1/auth/senha/redefinir',
    ]);
  });

  it('lista acessos e dispositivos e encerra um dispositivo', async () => {
    const { api, cache, requisicoes } = montar({ itens: [] });
    await cache.query(consultasSessao(api).acessos());
    await cache.query(consultasSessao(api).dispositivos());
    const vazio = montar(null);
    const id = '0199a000-0000-7000-8000-000000000009';
    await vazio.mutacoes.revogarDispositivo.mutationFn(id);
    await vazio.mutacoes.revogarDispositivo.onSuccess();
    expect([...requisicoes, ...vazio.requisicoes].map(caminho)).toEqual([
      'GET /v1/auth/acessos',
      'GET /v1/auth/dispositivos',
      `DELETE /v1/auth/dispositivos/${id}`,
    ]);
  });
});
