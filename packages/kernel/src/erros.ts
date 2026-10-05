/**
 * Erros de negócio esperados. A categoria orienta o mapeamento para HTTP (problem+json, feito na
 * API); o código é estável e serve a clientes e ao catálogo de mensagens; a mensagem é pt-BR.
 */
export type CategoriaErro =
  'nao-encontrado' | 'conflito' | 'proibido' | 'validacao' | 'regra-de-negocio';

export abstract class ErroDominio extends Error {
  abstract readonly categoria: CategoriaErro;
  readonly codigo: string;

  constructor(codigo: string, mensagem: string, opcoes?: ErrorOptions) {
    super(mensagem, opcoes);
    this.name = new.target.name;
    this.codigo = codigo;
  }
}

/** O recurso não existe para este tenant (ou o usuário não pode saber que existe). */
export class NaoEncontrado extends ErroDominio {
  readonly categoria = 'nao-encontrado';
}

/** O estado atual impede a operação (ex.: prazo já confirmado, edição concorrente). */
export class Conflito extends ErroDominio {
  readonly categoria = 'conflito';
}

/** O usuário está identificado, mas não tem permissão para a operação. */
export class Proibido extends ErroDominio {
  readonly categoria = 'proibido';
}

/** A operação viola uma regra de negócio (ex.: sem regra legal cadastrada para o ato). */
export class RegraDeNegocio extends ErroDominio {
  readonly categoria = 'regra-de-negocio';
}

export interface ProblemaValidacao {
  readonly campo: string;
  readonly mensagem: string;
}

/** Entrada inválida, com os problemas por campo. */
export class Validacao extends ErroDominio {
  readonly categoria = 'validacao';
  readonly problemas: readonly ProblemaValidacao[];

  constructor(problemas: readonly ProblemaValidacao[], codigo = 'validacao', mensagem?: string) {
    super(codigo, mensagem ?? `Dados inválidos: ${problemas.map((p) => p.campo).join(', ')}.`);
    this.problemas = problemas;
  }
}
