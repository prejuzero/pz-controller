import type { Relatorio, RepositorioDeRelatorios } from '../application/portas.js';
import type { Instant, Uuid } from '@pz/kernel';

/** Repositório em memória (testes e composição sem banco). */
export class RelatoriosEmMemoria implements RepositorioDeRelatorios<unknown> {
  readonly itens = new Map<Uuid, Relatorio>();

  inserir(_tx: unknown, r: Relatorio): Promise<void> {
    this.itens.set(r.id, r);
    return Promise.resolve();
  }

  buscar(_tx: unknown, id: Uuid): Promise<Relatorio | undefined> {
    return Promise.resolve(this.itens.get(id));
  }

  recentes(_tx: unknown, usuarioId: Uuid, limite: number): Promise<Relatorio[]> {
    return Promise.resolve(
      [...this.itens.values()]
        .filter((r) => r.usuarioId === usuarioId)
        .sort((a, b) => b.solicitadoEm.comparar(a.solicitadoEm) || b.id.localeCompare(a.id))
        .slice(0, limite),
    );
  }

  concluir(
    _tx: unknown,
    id: Uuid,
    c: { em: Instant; expiraEm: Instant; linhas: number },
  ): Promise<void> {
    const r = this.itens.get(id);
    if (r !== undefined) {
      this.itens.set(id, {
        ...r,
        situacao: 'concluido',
        linhas: c.linhas,
        concluidoEm: c.em,
        expiraEm: c.expiraEm,
      });
    }
    return Promise.resolve();
  }

  expiradosComArquivo(
    _tx: unknown,
    ate: Instant,
    limite: number,
  ): Promise<Pick<Relatorio, 'id' | 'tenantId' | 'formato'>[]> {
    return Promise.resolve(
      [...this.itens.values()]
        .filter(
          (r) =>
            r.situacao === 'concluido' &&
            r.arquivoRemovidoEm === undefined &&
            r.expiraEm !== undefined &&
            !r.expiraEm.ehDepoisDe(ate),
        )
        .slice(0, limite),
    );
  }

  marcarArquivoRemovido(_tx: unknown, id: Uuid, em: Instant): Promise<void> {
    const r = this.itens.get(id);
    if (r !== undefined) this.itens.set(id, { ...r, arquivoRemovidoEm: em });
    return Promise.resolve();
  }

  falhar(_tx: unknown, id: Uuid): Promise<boolean> {
    const r = this.itens.get(id);
    if (r?.situacao !== 'pendente') return Promise.resolve(false);
    this.itens.set(id, { ...r, situacao: 'falhou' });
    return Promise.resolve(true);
  }
}
