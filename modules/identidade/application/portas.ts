import type { Email } from '../domain/credenciais.js';
import type { Sessao } from '../domain/sessao.js';
import type { Instant, Uuid } from '@pz/kernel';

export interface CredencialArmazenada {
  readonly usuarioId: Uuid;
  readonly tenantId: Uuid;
  /** null: usuário ainda sem senha definida (não consegue entrar). */
  readonly senhaHash: string | null;
}

export interface RepositorioDeCredenciais {
  /** Busca global pelo e-mail (único no sistema), antes de conhecer o tenant. */
  localizarPorEmail(email: Email): Promise<CredencialArmazenada | undefined>;
  /** Grava o hash da senha, no tenant do contexto. */
  definirSenha(usuarioId: Uuid, senhaHash: string): Promise<void>;
}

export interface HasherDeSenha {
  gerar(senha: string): Promise<string>;
  /** Comparação em tempo constante; hash malformado devolve false. */
  verificar(hash: string, senha: string): Promise<boolean>;
}

/** Sessões opacas: só o hash do token é guardado; o token fica com o cliente. */
export interface ArmazemDeSessoes {
  gravar(token: string, sessao: Sessao, expiraEm: Instant): Promise<void>;
  obter(token: string): Promise<Sessao | undefined>;
  remover(token: string): Promise<void>;
  removerTodasDoUsuario(usuarioId: Uuid): Promise<void>;
}

export interface GeradorDeTokens {
  /** Token aleatório de 256 bits, codificado para cookie e cabeçalho. */
  novoToken(): string;
}
