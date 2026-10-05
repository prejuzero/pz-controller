import { avaliarSituacao } from '../domain/situacao.js';

import type { ResultadoVerificacao, Situacao } from '../domain/situacao.js';
import type { Clock, Instant } from '@pz/kernel';

/** Porta: confere se uma dependência (banco, Redis, armazenamento) responde. Lança se não. */
export interface VerificadorDeDependencia {
  readonly nome: string;
  verificar(): Promise<void>;
}

export interface RelatorioDeSituacao {
  readonly situacao: Situacao;
  readonly versao: string;
  readonly verificadoEm: Instant;
  readonly dependencias: readonly ResultadoVerificacao[];
}

const LIMITE_PADRAO_MS = 2_000;

function comLimite(promessa: Promise<void>, limiteMs: number): Promise<void> {
  let temporizador: NodeJS.Timeout | undefined;
  const expirou = new Promise<never>((_, rejeitar) => {
    temporizador = setTimeout(() => {
      rejeitar(new Error(`sem resposta em ${String(limiteMs)} ms`));
    }, limiteMs);
  });
  return Promise.race([promessa, expirou]).finally(() => {
    clearTimeout(temporizador);
  });
}

/** Consulta a situação da plataforma verificando todas as dependências em paralelo. */
export class ConsultarSituacao {
  constructor(
    private readonly verificadores: readonly VerificadorDeDependencia[],
    private readonly relogio: Clock,
    private readonly versao: string,
    private readonly limiteMs: number = LIMITE_PADRAO_MS,
  ) {}

  async executar(): Promise<RelatorioDeSituacao> {
    const dependencias = await Promise.all(
      this.verificadores.map(async (verificador): Promise<ResultadoVerificacao> => {
        const inicio = this.relogio.agora();
        try {
          await comLimite(verificador.verificar(), this.limiteMs);
          return {
            dependencia: verificador.nome,
            disponivel: true,
            latenciaMs: inicio.msAte(this.relogio.agora()),
          };
        } catch (erro) {
          return {
            dependencia: verificador.nome,
            disponivel: false,
            latenciaMs: inicio.msAte(this.relogio.agora()),
            motivo: erro instanceof Error ? erro.message : String(erro),
          };
        }
      }),
    );
    return {
      situacao: avaliarSituacao(dependencias),
      versao: this.versao,
      verificadoEm: this.relogio.agora(),
      dependencias,
    };
  }
}
