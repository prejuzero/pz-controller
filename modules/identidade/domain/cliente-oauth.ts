import { err, ok, Validacao } from '@pz/kernel';

import { CATALOGO_DE_PERMISSOES, ehPermissao } from './permissoes.js';

import type { Permissao } from './permissoes.js';
import type { Result } from '@pz/kernel';

/**
 * Escopos que um cliente de integração pode receber (HU49, ADR-015): só permissões de leitura do
 * catálogo e só as que o usuário que registra já tem. Integração não confirma prazo, não ajusta
 * data nem dá ciência: isso é do advogado (CLAUDE.md, seção 2).
 */
export function escoposDoCliente(
  pedidos: readonly string[],
  doUsuario: ReadonlySet<Permissao>,
): Result<Permissao[], Validacao> {
  const unicos = [...new Set(pedidos)];
  if (unicos.length === 0) {
    return err(new Validacao([{ campo: 'escopos', mensagem: 'Informe ao menos um escopo.' }]));
  }
  const problemas = unicos.flatMap((escopo) => {
    if (!ehPermissao(escopo)) return [`Escopo desconhecido: ${escopo}.`];
    if (!CATALOGO_DE_PERMISSOES[escopo].leitura) {
      return [`Integrações só recebem escopos de leitura: ${escopo}.`];
    }
    if (!doUsuario.has(escopo)) return [`Você não tem a permissão ${escopo}.`];
    return [];
  });
  return problemas.length === 0
    ? ok(unicos.filter(ehPermissao))
    : err(new Validacao(problemas.map((mensagem) => ({ campo: 'escopos', mensagem }))));
}

/**
 * Escopos do token (RFC 6749, seção 3.3): sem `scope`, todos os do cliente; com ele, um
 * subconjunto. `undefined` quando pede algum escopo que o cliente não tem.
 */
export function escoposDoToken(
  pedido: string | undefined,
  doCliente: readonly string[],
): string[] | undefined {
  if (pedido === undefined || pedido.trim() === '') return [...doCliente];
  const pedidos = [...new Set(pedido.trim().split(/\s+/))];
  return pedidos.every((p) => doCliente.includes(p)) ? pedidos : undefined;
}

/** `confidencial`: integrador com segredo (Client Credentials); `publico`: app sem segredo (PKCE). */
export type TipoDeClienteOAuth = 'confidencial' | 'publico';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Endereços de retorno de um cliente público (OAuth 2.1, seção 2.3.1; RFC 8252 para apps
 * nativos): HTTPS, ou HTTP só no loopback; sem fragmento; de 1 a 5. A comparação no pedido de
 * autorização é por igualdade exata.
 */
export function enderecosDeRetorno(uris: readonly string[]): Result<string[], Validacao> {
  const unicos = [...new Set(uris.map((u) => u.trim()))];
  const problema = (mensagem: string) => err(new Validacao([{ campo: 'redirectUris', mensagem }]));
  if (unicos.length === 0 || unicos.length > 5) {
    return problema('Informe de 1 a 5 endereços de retorno.');
  }
  for (const uri of unicos) {
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      return problema(`Endereço inválido: ${uri}.`);
    }
    const seguro =
      url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
    if (!seguro) return problema(`Use HTTPS (HTTP só em localhost): ${uri}.`);
    if (url.hash !== '' || uri.includes('#')) return problema(`Sem fragmento (#): ${uri}.`);
    if (url.username !== '' || url.password !== '') {
      return problema(`Sem usuário e senha no endereço: ${uri}.`);
    }
  }
  return ok(unicos);
}

/** `code_challenge` e `code_verifier` do PKCE (RFC 7636, seção 4.1): 43 a 128 caracteres. */
export const FORMATO_PKCE = /^[A-Za-z0-9._~-]{43,128}$/;
