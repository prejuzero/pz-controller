import type { Email } from '../domain/credenciais.js';
import type { Sessao } from '../domain/sessao.js';
import type { Instant, Uuid } from '@pz/kernel';

export interface CredencialArmazenada {
  readonly usuarioId: Uuid;
  readonly tenantId: Uuid;
  /** null: usuário ainda sem senha definida (não consegue entrar). */
  readonly senhaHash: string | null;
  readonly segundoFatorAtivo: boolean;
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

export interface DadosSegundoFator {
  readonly email: string;
  readonly segredoCifrado: string | null;
  readonly ativo: boolean;
  readonly ultimoPasso: number | null;
}

/** 2FA do usuário, no tenant do contexto (a sessão já identificou o tenant). */
export interface RepositorioDeSegundoFator {
  obter(usuarioId: Uuid): Promise<DadosSegundoFator | undefined>;
  /** Guarda o segredo ainda não ativado (substitui um pendente anterior). */
  guardarSegredoPendente(usuarioId: Uuid, segredoCifrado: string): Promise<void>;
  ativar(
    usuarioId: Uuid,
    passo: number,
    em: Instant,
    hashesDosCodigos: readonly string[],
  ): Promise<void>;
  /** Aceita o passo só se for posterior ao último aceito (atômico): o código não se reutiliza. */
  registrarPasso(usuarioId: Uuid, passo: number): Promise<boolean>;
  /** Consome o código de recuperação (atômico); false se não existe ou já foi usado. */
  consumirCodigo(usuarioId: Uuid, hash: string): Promise<boolean>;
}

/** Operações criptográficas do 2FA (RFC 6238/4226), implementadas na infra. */
export interface SegredosDoSegundoFator {
  novoSegredo(): string;
  codigo(segredo: string, passo: number): string;
  novoCodigoDeRecuperacao(): string;
  hashDoCodigoDeRecuperacao(codigo: string): string;
  uri(segredo: string, email: string): string;
  /** Comparação em tempo constante. */
  iguais(a: string, b: string): boolean;
}

export interface Cifra {
  cifrar(texto: string): string;
  decifrar(cifrado: string): string;
}
