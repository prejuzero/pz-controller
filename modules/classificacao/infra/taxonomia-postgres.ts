import { TiposDeAtoPostgres } from '@pz/prazos';

import type { Taxonomia, TipoDaTaxonomia } from '../application/classificar-publicacao.js';
import type { Transacao } from '@pz/db';

/** Taxonomia única de atos, pela API pública do módulo prazos (HU15). */
export class TaxonomiaPostgres implements Taxonomia<Transacao> {
  readonly #tipos = new TiposDeAtoPostgres();

  async listar(tx: Transacao): Promise<TipoDaTaxonomia[]> {
    return (await this.#tipos.listar(tx)).map(({ codigo, nome, descricao }) => ({
      codigo,
      nome,
      descricao,
    }));
  }
}
