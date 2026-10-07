import type { Exportacao, RepositorioDeExportacoes } from '../application/portas.js';
import type { EscopoDeExportacao } from '../domain/exportacao.js';
import type { Instant, TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Pedidos de exportação em memória, com a semântica do Postgres. Só para testes. */
export class ExportacoesEmMemoria implements RepositorioDeExportacoes<TransacaoEmMemoria> {
  readonly itens = new Map<string, Exportacao>();

  inserir(tx: TransacaoEmMemoria, e: Exportacao): Promise<void> {
    tx.aoConfirmar(() => this.itens.set(e.id, e));
    return Promise.resolve();
  }

  buscar(_tx: TransacaoEmMemoria, id: Uuid): Promise<Exportacao | undefined> {
    return Promise.resolve(this.itens.get(id));
  }

  pendente(_tx: TransacaoEmMemoria, usuarioId: Uuid, escopo: EscopoDeExportacao) {
    return Promise.resolve(
      [...this.itens.values()].find(
        (e) => e.usuarioId === usuarioId && e.escopo === escopo && e.situacao === 'pendente',
      ),
    );
  }

  concluir(_tx: TransacaoEmMemoria, id: Uuid, em: Instant, expiraEm: Instant): Promise<void> {
    const atual = this.itens.get(id);
    if (atual !== undefined) {
      this.itens.set(id, { ...atual, situacao: 'concluida', concluidaEm: em, expiraEm });
    }
    return Promise.resolve();
  }
}
