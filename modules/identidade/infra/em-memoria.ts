import type {
  ArmazemDeSessoes,
  CredencialArmazenada,
  RepositorioDeCredenciais,
} from '../application/portas.js';
import type { Email } from '../domain/credenciais.js';
import type { Sessao } from '../domain/sessao.js';
import type { Uuid } from '@pz/kernel';

/** Credenciais em memória, para testes das apps (sem PostgreSQL). */
export class CredenciaisEmMemoria implements RepositorioDeCredenciais {
  readonly #porEmail = new Map<string, CredencialArmazenada>();

  cadastrar(email: Email, credencial: CredencialArmazenada): void {
    this.#porEmail.set(email, credencial);
  }

  localizarPorEmail(email: Email): Promise<CredencialArmazenada | undefined> {
    return Promise.resolve(this.#porEmail.get(email));
  }

  definirSenha(usuarioId: Uuid, senhaHash: string): Promise<void> {
    for (const [email, credencial] of this.#porEmail) {
      if (credencial.usuarioId === usuarioId)
        this.#porEmail.set(email, { ...credencial, senhaHash });
    }
    return Promise.resolve();
  }
}

/** Sessões em memória, para testes das apps (sem Redis). */
export class SessoesEmMemoria implements ArmazemDeSessoes {
  readonly #sessoes = new Map<string, Sessao>();

  gravar(token: string, sessao: Sessao): Promise<void> {
    this.#sessoes.set(token, sessao);
    return Promise.resolve();
  }

  obter(token: string): Promise<Sessao | undefined> {
    return Promise.resolve(this.#sessoes.get(token));
  }

  remover(token: string): Promise<void> {
    this.#sessoes.delete(token);
    return Promise.resolve();
  }

  removerTodasDoUsuario(usuarioId: Uuid): Promise<void> {
    for (const [token, sessao] of this.#sessoes) {
      if (sessao.usuarioId === usuarioId) this.#sessoes.delete(token);
    }
    return Promise.resolve();
  }
}
