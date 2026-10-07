import type {
  NovoAceite,
  RepositorioDeAceites,
  RepositorioDeDocumentos,
} from '../application/portas.js';
import type { Aceite, DocumentoLegal } from '../domain/documento.js';
import type { Instant, TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Documentos e aceites em memória, com a semântica do Postgres. Só para testes. */
export class TermosEmMemoria
  implements RepositorioDeDocumentos<TransacaoEmMemoria>, RepositorioDeAceites<TransacaoEmMemoria>
{
  readonly documentos: DocumentoLegal[] = [];
  readonly aceites: NovoAceite[] = [];

  publicadosAte(_tx: TransacaoEmMemoria, ate: Instant): Promise<DocumentoLegal[]> {
    return Promise.resolve(this.documentos.filter((d) => !d.publicadoEm.ehDepoisDe(ate)));
  }

  buscar(_tx: TransacaoEmMemoria, id: Uuid): Promise<DocumentoLegal | undefined> {
    return Promise.resolve(this.documentos.find((d) => d.id === id));
  }

  aceitosPor(_tx: TransacaoEmMemoria, usuarioId: Uuid): Promise<Aceite[]> {
    return Promise.resolve(
      this.aceites
        .filter((a) => a.usuarioId === usuarioId)
        .flatMap((a) => {
          const d = this.documentos.find((doc) => doc.id === a.documentoId);
          return d === undefined
            ? []
            : [
                {
                  documentoId: a.documentoId,
                  tipo: d.tipo,
                  versao: d.versao,
                  aceitoEm: a.aceitoEm,
                  ip: a.ip,
                  userAgent: a.userAgent,
                },
              ];
        }),
    );
  }

  registrar(tx: TransacaoEmMemoria, aceite: NovoAceite): Promise<boolean> {
    const existe = this.aceites.some(
      (a) =>
        a.tenantId === aceite.tenantId &&
        a.usuarioId === aceite.usuarioId &&
        a.documentoId === aceite.documentoId,
    );
    if (!existe) tx.aoConfirmar(() => this.aceites.push(aceite));
    return Promise.resolve(!existe);
  }
}
