import type {
  ConsultaDaRevisaoManual,
  ItemDaRevisaoManual,
} from '../application/fila-de-revisao.js';
import type { Uuid } from '@pz/kernel';

/** Fila de revisão manual em memória, na ordem do Postgres (conteúdo, UUIDv7). Só para testes. */
export class RevisaoManualEmMemoria implements ConsultaDaRevisaoManual<unknown> {
  readonly itens: ItemDaRevisaoManual[] = [];

  listar(
    _tx: unknown,
    pagina: { readonly limite: number; readonly apos?: Uuid },
  ): Promise<ItemDaRevisaoManual[]> {
    const { apos } = pagina;
    return Promise.resolve(
      [...this.itens]
        .sort((a, b) => a.conteudoId.localeCompare(b.conteudoId))
        .filter((i) => apos === undefined || i.conteudoId > apos)
        .slice(0, pagina.limite),
    );
  }
}
