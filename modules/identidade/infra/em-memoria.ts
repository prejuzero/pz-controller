import type {
  ArmazemDeSessoes,
  CredencialArmazenada,
  DadosSegundoFator,
  RepositorioDeCredenciais,
  RepositorioDeSegundoFator,
} from '../application/portas.js';
import type { Email } from '../domain/credenciais.js';
import type { Sessao } from '../domain/sessao.js';
import type { Instant, Uuid } from '@pz/kernel';

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

/** 2FA em memória, para testes das apps (sem PostgreSQL). */
export class SegundoFatorEmMemoria implements RepositorioDeSegundoFator {
  readonly #dados = new Map<string, DadosSegundoFator & { codigos: string[] }>();

  cadastrar(usuarioId: Uuid, email: string): void {
    this.#dados.set(usuarioId, {
      email,
      segredoCifrado: null,
      ativo: false,
      ultimoPasso: null,
      codigos: [],
    });
  }

  obter(usuarioId: Uuid): Promise<DadosSegundoFator | undefined> {
    return Promise.resolve(this.#dados.get(usuarioId));
  }

  guardarSegredoPendente(usuarioId: Uuid, segredoCifrado: string): Promise<void> {
    const dados = this.#dados.get(usuarioId);
    if (dados !== undefined && !dados.ativo)
      this.#dados.set(usuarioId, { ...dados, segredoCifrado });
    return Promise.resolve();
  }

  ativar(usuarioId: Uuid, passo: number, _em: Instant, hashes: readonly string[]): Promise<void> {
    const dados = this.#dados.get(usuarioId);
    if (dados !== undefined)
      this.#dados.set(usuarioId, {
        ...dados,
        ativo: true,
        ultimoPasso: passo,
        codigos: [...hashes],
      });
    return Promise.resolve();
  }

  registrarPasso(usuarioId: Uuid, passo: number): Promise<boolean> {
    const dados = this.#dados.get(usuarioId);
    if (dados === undefined || (dados.ultimoPasso !== null && passo <= dados.ultimoPasso))
      return Promise.resolve(false);
    this.#dados.set(usuarioId, { ...dados, ultimoPasso: passo });
    return Promise.resolve(true);
  }

  consumirCodigo(usuarioId: Uuid, hash: string): Promise<boolean> {
    const dados = this.#dados.get(usuarioId);
    if (dados?.codigos.includes(hash) !== true) return Promise.resolve(false);
    this.#dados.set(usuarioId, { ...dados, codigos: dados.codigos.filter((c) => c !== hash) });
    return Promise.resolve(true);
  }
}
