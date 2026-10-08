import type { Instant, UnidadeDeTrabalho } from '@pz/kernel';

/**
 * E-mails rejeitados (bounce ou reclamação de spam) que deixam de receber envios (HU30). Lista
 * global para o administrador da plataforma (HU39): é dado da plataforma, não do escritório.
 */
export interface Supressao {
  readonly email: string;
  readonly motivo: 'bounce' | 'spam';
  readonly criadaEm: Instant;
}

export interface ConsultaDeSupressoes<Transacao> {
  /** Em ordem de e-mail; `apos` é o último e-mail da página anterior. */
  listar(
    transacao: Transacao,
    pagina: { readonly limite: number; readonly apos?: string },
  ): Promise<Supressao[]>;
}

export interface PaginaDeSupressoes {
  readonly itens: readonly Supressao[];
  readonly proximoCursor: string | null;
}

export class ListarSupressoes<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly supressoes: ConsultaDeSupressoes<Transacao>,
  ) {}

  async executar(pagina: {
    readonly limite: number;
    readonly apos?: string;
  }): Promise<PaginaDeSupressoes> {
    const linhas = await this.unidade.executar((tx) =>
      this.supressoes.listar(tx, { ...pagina, limite: pagina.limite + 1 }),
    );
    const itens = linhas.slice(0, pagina.limite);
    const ultimo = itens.at(-1);
    return {
      itens,
      proximoCursor: linhas.length > pagina.limite && ultimo !== undefined ? ultimo.email : null,
    };
  }
}
