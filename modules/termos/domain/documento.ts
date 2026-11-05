import type { Instant, Uuid } from '@pz/kernel';

export const TIPOS_DE_DOCUMENTO = ['termos', 'privacidade', 'cobertura'] as const;
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];

/** Documento legal publicado (HU38): imutável; nova redação é nova versão. */
export interface DocumentoLegal {
  readonly id: Uuid;
  readonly tipo: TipoDeDocumento;
  readonly versao: string;
  readonly conteudo: string;
  /** O que mudou em relação à versão anterior, para a tela de novo aceite. */
  readonly resumoAlteracoes?: string;
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

/** Mesmo formato do banco (`documento_legal_versao`): 1.0 ou 1.0.1. */
const FORMATO_DA_VERSAO = /^[0-9]+\.[0-9]+(\.[0-9]+)?$/;

/** Compara versões número a número (1.10 é maior que 1.9; 1.0 e 1.0.0 são iguais). */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diferenca = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diferenca !== 0) return diferenca;
  }
  return 0;
}

export interface NovaVersao {
  readonly tipo: TipoDeDocumento;
  readonly versao: string;
  readonly conteudo: string;
  readonly resumoAlteracoes?: string;
}

/**
 * Regras da publicação (PZ-303): versão no formato do banco e maior que todas as já gravadas do
 * mesmo tipo (sem reaproveitar número), texto não vazio. Devolve os problemas por campo.
 */
export function problemasDaNovaVersao(
  nova: NovaVersao,
  existentes: readonly DocumentoLegal[],
): { campo: string; mensagem: string }[] {
  const problemas: { campo: string; mensagem: string }[] = [];
  if (!FORMATO_DA_VERSAO.test(nova.versao)) {
    problemas.push({ campo: 'versao', mensagem: 'Use o formato 1.0 ou 1.0.1.' });
  } else if (
    existentes.some((d) => d.tipo === nova.tipo && compararVersoes(nova.versao, d.versao) <= 0)
  ) {
    problemas.push({
      campo: 'versao',
      mensagem: 'A versão precisa ser maior que todas as já publicadas deste documento.',
    });
  }
  if (nova.conteudo.trim().length === 0)
    problemas.push({ campo: 'conteudo', mensagem: 'Informe o texto do documento.' });
  return problemas;
}
