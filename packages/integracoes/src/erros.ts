/**
 * Erros classificados de integração (ADR-005). Todo adaptador converte as falhas do provedor
 * numa destas classes; é a classe que decide retentativa e circuit breaker, não o adaptador.
 */
export type TipoErroIntegracao =
  'transitorio' | 'permanente' | 'limite-excedido' | 'credencial-invalida';

export abstract class ErroIntegracao extends Error {
  abstract readonly tipo: TipoErroIntegracao;
  /** Vale tentar de novo a mesma chamada? */
  abstract readonly retentavel: boolean;
  /** Indica o provedor fora do ar ou mal configurado (conta para abrir o circuito)? */
  abstract readonly indicaDegradacao: boolean;

  constructor(
    mensagem: string,
    readonly adaptador: string,
    opcoes?: { readonly causa?: unknown },
  ) {
    super(mensagem, opcoes?.causa === undefined ? undefined : { cause: opcoes.causa });
    this.name = new.target.name;
  }
}

/** Falha passageira: rede, timeout, 5xx, indisponibilidade. Tenta de novo. */
export class ErroTransitorio extends ErroIntegracao {
  readonly tipo = 'transitorio';
  readonly retentavel = true;
  readonly indicaDegradacao = true;
}

/** Pedido inválido ou recurso inexistente: repetir não muda o resultado. */
export class ErroPermanente extends ErroIntegracao {
  readonly tipo = 'permanente';
  readonly retentavel = false;
  readonly indicaDegradacao = false;
}

/** O provedor recusou por cota (ex.: HTTP 429). Tenta de novo depois, sem abrir o circuito. */
export class ErroLimiteExcedido extends ErroIntegracao {
  readonly tipo = 'limite-excedido';
  readonly retentavel = true;
  readonly indicaDegradacao = false;

  constructor(
    mensagem: string,
    adaptador: string,
    opcoes?: { readonly causa?: unknown; readonly repetirAposMs?: number },
  ) {
    super(mensagem, adaptador, opcoes);
    this.repetirAposMs = opcoes?.repetirAposMs;
  }

  readonly repetirAposMs: number | undefined;
}

/** Credencial ausente, expirada ou revogada: exige ação humana, e todo uso falha até lá. */
export class ErroCredencialInvalida extends ErroIntegracao {
  readonly tipo = 'credencial-invalida';
  readonly retentavel = false;
  readonly indicaDegradacao = true;
}
