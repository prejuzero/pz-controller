import type { Transacao } from '@pz/db';

type Valor = string | number | boolean | null | readonly number[];
interface Secao {
  readonly nome: string;
  readonly linhas: readonly Readonly<Record<string, Valor>>[];
}
const iso = (data: Date | null) => data?.toISOString() ?? null;

/** Consentimentos e preferências de notificação para a exportação (HU38, LGPD). */
export class ExportacaoDasNotificacoesPostgres {
  async titular(tx: Transacao, usuarioId: string): Promise<Secao[]> {
    return this.#secoes(tx, { usuarioId });
  }

  async escritorio(tx: Transacao): Promise<Secao[]> {
    return this.#secoes(tx, {});
  }

  async #secoes(tx: Transacao, filtro: { usuarioId?: string }): Promise<Secao[]> {
    const [consentimentos, preferencias] = await Promise.all([
      tx.consentimentoCanal.findMany({ where: filtro, orderBy: { concedidoEm: 'asc' } }),
      tx.preferenciaNotificacao.findMany({ where: filtro }),
    ]);
    return [
      {
        nome: 'consentimentos',
        linhas: consentimentos.map((c) => ({
          usuarioId: c.usuarioId,
          canal: c.canal,
          destino: c.destino,
          origem: c.origem,
          concedidoEm: iso(c.concedidoEm),
          revogadoEm: iso(c.revogadoEm),
        })),
      },
      {
        nome: 'preferencias',
        linhas: preferencias.map((p) => ({
          usuarioId: p.usuarioId,
          tipo: p.tipo,
          canal: p.canal,
          ativo: p.ativo,
          antecedencias: p.antecedencias,
        })),
      },
    ];
  }
}
