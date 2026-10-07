import type { Transacao } from '@pz/db';

type Valor = string | number | boolean | null;
interface Secao {
  readonly nome: string;
  readonly linhas: readonly Readonly<Record<string, Valor>>[];
}

/** Aceites de termos para a exportação (HU38, LGPD). */
export class ExportacaoDosTermosPostgres {
  async titular(tx: Transacao, usuarioId: string): Promise<Secao[]> {
    return [{ nome: 'aceites', linhas: await this.#aceites(tx, { usuarioId }) }];
  }

  async escritorio(tx: Transacao): Promise<Secao[]> {
    return [{ nome: 'aceites', linhas: await this.#aceites(tx, {}) }];
  }

  async #aceites(tx: Transacao, filtro: { usuarioId?: string }) {
    const linhas = await tx.aceiteDocumento.findMany({
      where: filtro,
      include: { documento: { select: { tipo: true, versao: true } } },
      orderBy: { aceitoEm: 'asc' },
    });
    return linhas.map((a) => ({
      usuarioId: a.usuarioId,
      documento: a.documento.tipo,
      versao: a.documento.versao,
      aceitoEm: a.aceitoEm.toISOString(),
      ip: a.ip,
      navegador: a.userAgent,
    }));
  }
}
