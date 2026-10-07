import type { Instant, Uuid } from '@pz/kernel';

export const TIPOS_DE_DOCUMENTO = ['termos', 'privacidade', 'cobertura'] as const;
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];

/** Documento legal publicado (HU38): imutável; nova redação é nova versão. */
export interface DocumentoLegal {
  readonly id: Uuid;
  readonly tipo: TipoDeDocumento;
  readonly versao: string;
  readonly conteudo: string;
  readonly publicadoEm: Instant;
}

export interface Aceite {
  readonly documentoId: Uuid;
  readonly tipo: TipoDeDocumento;
  readonly versao: string;
  readonly aceitoEm: Instant;
  readonly ip: string;
  readonly userAgent: string;
}

/**
 * Documentos que o usuário ainda precisa aceitar: por tipo, a versão mais recente publicada até
 * `ate`, se ainda não aceita. Com `ate` = início da sessão, versão nova vale no próximo login.
 */
export function pendentes(
  documentos: readonly DocumentoLegal[],
  aceitos: ReadonlySet<Uuid>,
  ate: Instant,
): DocumentoLegal[] {
  const vigentes = new Map<TipoDeDocumento, DocumentoLegal>();
  for (const documento of documentos) {
    if (documento.publicadoEm.ehDepoisDe(ate)) continue;
    const atual = vigentes.get(documento.tipo);
    if (atual === undefined || documento.publicadoEm.ehDepoisDe(atual.publicadoEm)) {
      vigentes.set(documento.tipo, documento);
    }
  }
  return [...vigentes.values()]
    .filter((documento) => !aceitos.has(documento.id))
    .sort((a, b) => a.tipo.localeCompare(b.tipo));
}
