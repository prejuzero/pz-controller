// API pública do módulo identidade (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  AtivarSegundoFator,
  ConfigurarSegundoFator,
  VerificarSegundoFator,
} from './application/segundo-fator.js';
export {
  Autenticar,
  ElevarSessao,
  EncerrarSessao,
  RegistrarCredencial,
  ValidarSessao,
} from './application/sessoes.js';
export type { SessaoCriada } from './application/sessoes.js';
export type {
  ArmazemDeSessoes,
  Cifra,
  CredencialArmazenada,
  DadosSegundoFator,
  GeradorDeTokens,
  HasherDeSenha,
  RepositorioDeCredenciais,
  RepositorioDeSegundoFator,
  SegredosDoSegundoFator,
} from './application/portas.js';
export {
  normalizarEmail,
  SENHA_MAXIMO,
  SENHA_MINIMO,
  validarNovaSenha,
} from './domain/credenciais.js';
export type { Email } from './domain/credenciais.js';
export { DURACAO_MAXIMA_MS, estaAtiva, expiracao, INATIVIDADE_MAXIMA_MS } from './domain/sessao.js';
export type { NivelSessao, Sessao } from './domain/sessao.js';
export { HasherArgon2, PARAMETROS_ARGON2 } from './infra/argon2.js';
export { CredenciaisPostgres } from './infra/credenciais-postgres.js';
export { SessoesRedis } from './infra/sessoes-redis.js';
export { GeradorDeTokensSeguro, hashDoToken } from './infra/tokens.js';
export {
  CredenciaisEmMemoria,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
} from './infra/em-memoria.js';
export { CifraAesGcm, SegredosTotp } from './infra/segundo-fator.js';
export { SegundoFatorPostgres } from './infra/segundo-fator-postgres.js';
