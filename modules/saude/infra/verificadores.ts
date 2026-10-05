import { connect } from 'node:net';

import type { VerificadorDeDependencia } from '../application/consultar-situacao.js';

const PORTAS_PADRAO: Readonly<Record<string, number>> = {
  'postgres:': 5432,
  'postgresql:': 5432,
  'redis:': 6379,
  'rediss:': 6379,
  'http:': 80,
  'https:': 443,
};

/**
 * Confere se o serviço aceita conexões TCP no host e porta da URL (banco, Redis). Basta para a
 * prontidão enquanto os clientes dos serviços não existem; a HU05 (banco) e a HU10 (Redis)
 * trocam por verificações no protocolo de cada um.
 */
export class VerificadorTcp implements VerificadorDeDependencia {
  private readonly host: string;
  private readonly porta: number;

  constructor(
    readonly nome: string,
    url: string,
  ) {
    const endereco = new URL(url);
    this.host = endereco.hostname;
    this.porta =
      endereco.port === '' ? (PORTAS_PADRAO[endereco.protocol] ?? 0) : Number(endereco.port);
    if (this.porta === 0) throw new Error(`${nome}: porta desconhecida para ${endereco.protocol}`);
  }

  verificar(): Promise<void> {
    return new Promise((resolver, rejeitar) => {
      const conexao = connect({ host: this.host, port: this.porta });
      conexao.once('connect', () => {
        conexao.destroy();
        resolver();
      });
      conexao.once('error', (erro) => {
        conexao.destroy();
        rejeitar(erro);
      });
    });
  }
}

/** Confere se o serviço HTTP responde sem erro de servidor (ex.: armazenamento S3-compatível). */
export class VerificadorHttp implements VerificadorDeDependencia {
  constructor(
    readonly nome: string,
    private readonly url: string,
  ) {}

  async verificar(): Promise<void> {
    const resposta = await fetch(this.url, { method: 'GET' });
    await resposta.body?.cancel();
    if (resposta.status >= 500)
      throw new Error(`${this.nome} respondeu ${String(resposta.status)}`);
  }
}
