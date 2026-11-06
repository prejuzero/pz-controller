// API pública do módulo webhooks (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  assinaturaPublica,
  CABECALHO_ASSINATURA,
  CABECALHO_EVENTO,
  CABECALHO_TIPO,
  DesativarAssinatura,
  EntregarWebhook,
  entregaPublica,
  ListarAssinaturas,
  ListarEntregas,
  ReenviarEntrega,
  RegistrarAssinatura,
  RegistrarEntregas,
  TestarAssinatura,
} from './application/webhooks.js';
export type {
  AssinaturaPublica,
  DependenciasDosWebhooks,
  DesfechoDaEntrega,
  EntregaPublica,
} from './application/webhooks.js';
export type {
  Assinatura,
  Autor,
  CifraDoSegredo,
  Criptografia,
  Entrega,
  RepositorioDeAssinaturas,
  RepositorioDeEntregas,
} from './application/portas.js';
export {
  EVENTO_DE_TESTE,
  EVENTOS_PUBLICOS,
  NOMES_DOS_EVENTOS_PUBLICOS,
  ORIGENS_DOS_EVENTOS_PUBLICOS,
} from './domain/eventos-publicos.js';
export type { EventoPublico } from './domain/eventos-publicos.js';
export { CriptografiaNode } from './infra/criptografia.js';
export { AssinaturasDeWebhookEmMemoria, EntregasDeWebhookEmMemoria } from './infra/em-memoria.js';
export {
  AssinaturasDeWebhookPostgres,
  EntregasDeWebhookPostgres,
} from './infra/webhooks-postgres.js';
