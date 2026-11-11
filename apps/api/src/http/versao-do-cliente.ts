import { HttpException, Inject, Injectable } from '@nestjs/common';
import { obterContexto, registrarRequisicaoDoCliente } from '@pz/observability';

import type { CanActivate } from '@nestjs/common';
import type { Banco } from '@pz/db';

export const CABECALHO_CLIENTE = 'x-cliente';
const FORMATO = /^([a-z][a-z0-9-]{0,19})\/(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;
const TTL_MS = 60_000;

export interface ClienteIdentificado {
  readonly plataforma: string;
  readonly versao: string;
}

/**
 * `X-Cliente: <plataforma>/<versão>` (HU63), enviado pelos apps. Sem o cabeçalho (portal web) ou
 * fora do formato, `undefined`: a requisição segue sem verificação de versão.
 */
export function lerCliente(valor: unknown): ClienteIdentificado | undefined {
  if (typeof valor !== 'string') return undefined;
  const r = FORMATO.exec(valor.trim());
  if (r === null) return undefined;
  const [, plataforma = '', maior = '', menor = '', correcao = ''] = r;
  return { plataforma, versao: [maior, menor, correcao].map(Number).join('.') };
}

/** Compara versões "maior.menor.correção" pelos números (1.10.0 > 1.9.0). */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Porta: versão mínima por plataforma; `undefined` = sem mínima (nada barrado). */
export type VersoesMinimas = (plataforma: string) => Promise<string | undefined>;
export const VERSOES_MINIMAS = Symbol('VERSOES_MINIMAS');

/**
 * Versões mínimas da tabela global `versao_minima_cliente`, relidas a cada minuto: mudar a
 * versão é um UPDATE, sem deploy (aceite da HU63).
 */
export function versoesMinimasDoBanco(
  banco: Pick<Banco, 'executarSemTenant'>,
  agoraMs: () => number = () => performance.now(),
): VersoesMinimas {
  let cache: { lidoEm: number; versoes: ReadonlyMap<string, string> } | undefined;
  return async (plataforma) => {
    if (cache === undefined || agoraMs() - cache.lidoEm > TTL_MS) {
      const linhas = await banco.executarSemTenant('versão mínima dos apps', (tx) =>
        tx.versaoMinimaCliente.findMany({ select: { plataforma: true, versao: true } }),
      );
      cache = {
        lidoEm: agoraMs(),
        versoes: new Map(linhas.map((l) => [l.plataforma, l.versao])),
      };
    }
    return cache.versoes.get(plataforma);
  };
}

/** 426 Upgrade Required (RFC 9110, 15.5.22) em problem+json, com a versão mínima no detalhe. */
export class ClienteDesatualizado extends HttpException {
  constructor(cliente: ClienteIdentificado, minima: string) {
    super(
      {
        detail: `A versão ${cliente.versao} do app (${cliente.plataforma}) não é mais aceita. Atualize para a ${minima} ou mais nova.`,
      },
      426,
    );
  }
}

/** Barra apps abaixo da versão mínima da plataforma (HU63); o portal não envia X-Cliente. */
@Injectable()
export class GuardaDeVersaoDoCliente implements CanActivate {
  constructor(@Inject(VERSOES_MINIMAS) private readonly minimas: VersoesMinimas) {}

  async canActivate(): Promise<boolean> {
    const cliente = lerCliente(obterContexto().cliente);
    if (cliente === undefined) return true;
    const minima = await this.minimas(cliente.plataforma);
    const barrada = minima !== undefined && compararVersoes(cliente.versao, minima) < 0;
    registrarRequisicaoDoCliente(cliente.plataforma, cliente.versao, barrada);
    if (barrada) throw new ClienteDesatualizado(cliente, minima);
    return true;
  }
}
