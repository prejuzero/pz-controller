import type {
  CienciaDoPrazo,
  RepositorioDeCiencia,
  TokenRegistrado,
} from '../application/ciencia.js';
import type { Instant, TransacaoEmMemoria, Uuid } from '@pz/kernel';

type Mutavel<T> = { -readonly [K in keyof T]: T[K] };

/** Tokens e ciência em memória, com o uso único do Postgres. Só para testes. */
export class CienciaEmMemoria implements RepositorioDeCiencia<TransacaoEmMemoria> {
  readonly tokens = new Map<string, Mutavel<TokenRegistrado>>();
  readonly estados = new Map<Uuid, CienciaDoPrazo>();

  tokenPorHash(_tx: TransacaoEmMemoria, hash: string): Promise<TokenRegistrado | undefined> {
    const t = this.tokens.get(hash);
    return Promise.resolve(t === undefined ? undefined : { ...t });
  }

  revogarAtivos(_tx: TransacaoEmMemoria, prazoId: Uuid, usuarioId: Uuid, agora: Instant) {
    for (const t of this.tokens.values()) {
      if (t.prazoId === prazoId && t.usuarioId === usuarioId && !t.usadoEm && !t.revogadoEm)
        t.revogadoEm = agora;
    }
    return Promise.resolve();
  }

  inserirToken(_tx: TransacaoEmMemoria, t: TokenRegistrado, hash: string): Promise<void> {
    this.tokens.set(hash, { ...t });
    return Promise.resolve();
  }

  usarToken(_tx: TransacaoEmMemoria, id: Uuid, agora: Instant): Promise<boolean> {
    const t = [...this.tokens.values()].find((x) => x.id === id);
    if (t === undefined || t.usadoEm !== undefined || t.revogadoEm !== undefined)
      return Promise.resolve(false);
    t.usadoEm = agora;
    return Promise.resolve(true);
  }

  ciencia(_tx: TransacaoEmMemoria, prazoId: Uuid): Promise<CienciaDoPrazo | undefined> {
    return Promise.resolve(this.estados.get(prazoId));
  }

  gravar(_tx: TransacaoEmMemoria, _tenantId: Uuid, prazoId: Uuid, c: CienciaDoPrazo) {
    this.estados.set(prazoId, c);
    return Promise.resolve();
  }
}
