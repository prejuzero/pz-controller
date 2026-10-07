import { err, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import type { OrigemDaAuditoria } from '@pz/auditoria';
import type { Result, Uuid } from '@pz/kernel';

/** Quem age num tenant com sessão: vem do contexto da requisição, nunca do corpo. */
export interface AutorNoTenant {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
}

export const origemDe = (autor: AutorNoTenant) => ({
  canal: autor.canal,
  usuarioId: autor.usuarioId,
});

export function validacao(erro: z.ZodError): Validacao {
  return new Validacao(
    erro.issues.map((problema) => ({ campo: problema.path.join('.'), mensagem: problema.message })),
  );
}

export const LIMITE_PADRAO = 20;
export const LIMITE_MAXIMO = 100;

/** `?cursor=&limite=` (ADR-009): o cursor é o id do último item, opaco para o cliente. */
export const ConsultaPaginada = z.object({
  cursor: z.string().max(100).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).default(LIMITE_PADRAO),
});

export interface Pagina<Item> {
  readonly itens: readonly Item[];
  readonly proximoCursor: string | null;
}

const Id = z.uuid();

export function lerCursor(cursor: string | undefined): Result<Uuid | undefined, Validacao> {
  if (cursor === undefined) return ok(undefined);
  const id = Id.safeParse(Buffer.from(cursor, 'base64url').toString('utf8'));
  return id.success
    ? ok(id.data as Uuid)
    : err(new Validacao([{ campo: 'cursor', mensagem: 'Cursor inválido.' }]));
}

/** O repositório devolve até `limite + 1` linhas: a sobra indica que há próxima página. */
export function paginar<Linha extends { id: Uuid }, Item>(
  linhas: readonly Linha[],
  limite: number,
  listar: (linha: Linha) => Item,
): Pagina<Item> {
  const itens = linhas.slice(0, limite);
  const ultimo = itens.at(-1);
  return {
    itens: itens.map(listar),
    proximoCursor:
      linhas.length > limite && ultimo !== undefined
        ? Buffer.from(ultimo.id, 'utf8').toString('base64url')
        : null,
  };
}
