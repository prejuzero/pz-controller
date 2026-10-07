import { Instant } from '@pz/kernel';

import type {
  NovoAceite,
  RepositorioDeAceites,
  RepositorioDeDocumentos,
} from '../application/portas.js';
import type { Aceite, DocumentoLegal } from '../domain/documento.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

const paraInstante = (data: Date) => Instant.deEpochMs(data.getTime());

type LinhaDocumento = NonNullable<Awaited<ReturnType<Transacao['documentoLegal']['findUnique']>>>;
const documento = (l: LinhaDocumento): DocumentoLegal => ({
  id: l.id as Uuid,
  tipo: l.tipo,
  versao: l.versao,
  conteudo: l.conteudo,
  publicadoEm: paraInstante(l.publicadoEm),
});

/** Documentos legais (tabela global, só leitura para a aplicação). */
export class DocumentosPostgres implements RepositorioDeDocumentos<Transacao> {
  async publicadosAte(tx: Transacao, ate: Instant): Promise<DocumentoLegal[]> {
    const linhas = await tx.documentoLegal.findMany({
      where: { publicadoEm: { lte: new Date(ate.epochMs) } },
      orderBy: [{ tipo: 'asc' }, { publicadoEm: 'asc' }],
    });
    return linhas.map(documento);
  }

  async buscar(tx: Transacao, id: Uuid): Promise<DocumentoLegal | undefined> {
    const linha = await tx.documentoLegal.findUnique({ where: { id } });
    return linha === null ? undefined : documento(linha);
  }
}

/** Aceites no tenant da transação (RLS). */
export class AceitesPostgres implements RepositorioDeAceites<Transacao> {
  async aceitosPor(tx: Transacao, usuarioId: Uuid): Promise<Aceite[]> {
    const linhas = await tx.aceiteDocumento.findMany({
      where: { usuarioId },
      include: { documento: { select: { tipo: true, versao: true } } },
      orderBy: { aceitoEm: 'asc' },
    });
    return linhas.map((l) => ({
      documentoId: l.documentoId as Uuid,
      tipo: l.documento.tipo,
      versao: l.documento.versao,
      aceitoEm: paraInstante(l.aceitoEm),
      ip: l.ip,
      userAgent: l.userAgent,
    }));
  }

  async registrar(tx: Transacao, aceite: NovoAceite): Promise<boolean> {
    const { count } = await tx.aceiteDocumento.createMany({
      data: [{ ...aceite, aceitoEm: new Date(aceite.aceitoEm.epochMs) }],
      skipDuplicates: true,
    });
    return count === 1;
  }
}
