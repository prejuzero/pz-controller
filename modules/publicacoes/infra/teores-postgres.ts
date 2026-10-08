import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/**
 * Teor de um conteúdo visível no tenant da transação (view `publicacao_do_tenant`): é o que a
 * classificação lê (HU21) no escritório que recebeu o conteúdo primeiro.
 */
export class TeoresPostgres {
  async teor(tx: Transacao, conteudoId: Uuid): Promise<string | undefined> {
    const [linha] = await tx.$queryRaw<{ teor: string }[]>`
      SELECT teor FROM publicacao_do_tenant WHERE conteudo_id = ${conteudoId}::uuid LIMIT 1`;
    return linha?.teor;
  }
}
