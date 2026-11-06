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
