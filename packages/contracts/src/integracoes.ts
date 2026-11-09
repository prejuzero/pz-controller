import { z } from 'zod';

import { definirRota, nomear } from './rota.js';

/**
 * Pedido de token (OAuth 2.1): `client_credentials` (integrador com segredo, no corpo ou em
 * `Authorization: Basic`), `authorization_code` (app público, com PKCE) e `refresh_token`
 * (renovação rotativa). Campos em snake_case por serem os nomes do padrão.
 */
export const PedidoDeTokenOAuth = nomear(
  'PedidoDeTokenOAuth',
  z.object({
    grant_type: z.enum(['client_credentials', 'authorization_code', 'refresh_token']),
    client_id: z.uuid().optional(),
    client_secret: z.string().min(20).max(200).optional(),
    scope: z.string().max(1000).optional().describe('Escopos separados por espaço.'),
    code: z.string().min(20).max(200).optional(),
    redirect_uri: z.string().max(2000).optional(),
    code_verifier: z.string().max(128).optional(),
    refresh_token: z.string().min(20).max(200).optional(),
  }),
);
export type PedidoDeTokenOAuth = z.infer<typeof PedidoDeTokenOAuth.esquema>;

export const TokenOAuth = nomear(
  'TokenOAuth',
  z.object({
    access_token: z.string(),
    token_type: z.literal('Bearer'),
    expires_in: z.int().positive().describe('Segundos (15 min).'),
    scope: z.string(),
    refresh_token: z
      .string()
      .optional()
      .describe('Só nos grants do app público: uso único; reutilizar revoga a sessão.'),
  }),
);
export type TokenOAuth = z.infer<typeof TokenOAuth.esquema>;

export const emitirTokenOAuth = definirRota({
  id: 'emitirTokenOAuth',
  metodo: 'post',
  caminho: '/v1/oauth/token',
  resumo: 'Emite token de acesso para um cliente de integração (Client Credentials).',
  tag: 'integracoes',
  publica: true,
  corpo: PedidoDeTokenOAuth,
  corpoTambemFormulario: true,
  resposta: { status: 200, corpo: TokenOAuth },
  erros: [401, 429],
});

const ClienteDeIntegracaoBase = z.object({
  id: z.uuid().describe('O `client_id`.'),
  nome: z.string(),
  tipo: z.enum(['confidencial', 'publico']),
  redirectUris: z.array(z.string()),
  escopos: z.array(z.string()),
  criadoEm: z.iso.datetime(),
  ultimoUso: z.iso.datetime().nullable(),
  revogadoEm: z.iso.datetime().nullable(),
});

export const ClientesDeIntegracao = nomear(
  'ClientesDeIntegracao',
  z.object({ itens: z.array(ClienteDeIntegracaoBase) }),
);
export type ClientesDeIntegracao = z.infer<typeof ClientesDeIntegracao.esquema>;

export const PedidoDeClienteDeIntegracao = nomear(
  'PedidoDeClienteDeIntegracao',
  z.object({
    nome: z.string().trim().min(1).max(100),
    escopos: z.array(z.string().max(64)).min(1).max(20),
  }),
);

/** App público (Authorization Code + PKCE): sem segredo, com endereços de retorno. */
export const PedidoDeAppOAuth = nomear(
  'PedidoDeAppOAuth',
  z.object({
    nome: z.string().trim().min(1).max(100),
    escopos: z.array(z.string().max(64)).min(1).max(20),
    redirectUris: z
      .array(z.string().max(2000))
      .min(1)
      .max(5)
      .describe('HTTPS, ou HTTP em localhost; comparados por igualdade exata.'),
  }),
);

export const AppOAuthCriado = nomear(
  'AppOAuthCriado',
  z.object({ cliente: ClienteDeIntegracaoBase }),
);
export type AppOAuthCriado = z.infer<typeof AppOAuthCriado.esquema>;

export const ClienteDeIntegracaoCriado = nomear(
  'ClienteDeIntegracaoCriado',
  z.object({
    cliente: ClienteDeIntegracaoBase,
    segredo: z.string().describe('O `client_secret`: mostrado só agora; guarde em local seguro.'),
  }),
);
export type ClienteDeIntegracaoCriado = z.infer<typeof ClienteDeIntegracaoCriado.esquema>;

export const EscoposDeIntegracao = nomear(
  'EscoposDeIntegracao',
  z.object({ itens: z.array(z.object({ escopo: z.string(), descricao: z.string() })) }),
);
export type EscoposDeIntegracao = z.infer<typeof EscoposDeIntegracao.esquema>;

export const listarEscoposDeIntegracao = definirRota({
  id: 'listarEscoposDeIntegracao',
  metodo: 'get',
  caminho: '/v1/integracoes/escopos',
  resumo: 'Escopos que um cliente de integração pode receber (só leitura).',
  tag: 'integracoes',
  resposta: { status: 200, corpo: EscoposDeIntegracao },
});

export const listarClientesDeIntegracao = definirRota({
  id: 'listarClientesDeIntegracao',
  metodo: 'get',
  caminho: '/v1/integracoes/clientes',
  resumo: 'Clientes de integração do escritório.',
  tag: 'integracoes',
  resposta: { status: 200, corpo: ClientesDeIntegracao },
});

export const registrarClienteDeIntegracao = definirRota({
  id: 'registrarClienteDeIntegracao',
  metodo: 'post',
  caminho: '/v1/integracoes/clientes',
  resumo: 'Registra um cliente de integração e devolve o segredo uma única vez.',
  tag: 'integracoes',
  corpo: PedidoDeClienteDeIntegracao,
  resposta: { status: 201, corpo: ClienteDeIntegracaoCriado },
});

export const registrarAppOAuth = definirRota({
  id: 'registrarAppOAuth',
  metodo: 'post',
  caminho: '/v1/integracoes/apps',
  resumo: 'Registra um app público (Authorization Code + PKCE), sem segredo.',
  tag: 'integracoes',
  corpo: PedidoDeAppOAuth,
  resposta: { status: 201, corpo: AppOAuthCriado },
});

export const revogarClienteDeIntegracao = definirRota({
  id: 'revogarClienteDeIntegracao',
  metodo: 'delete',
  caminho: '/v1/integracoes/clientes/{id}',
  resumo: 'Revoga o cliente e derruba na hora os tokens emitidos para ele.',
  tag: 'integracoes',
  parametrosDeCaminho: z.object({ id: z.uuid() }),
  resposta: { status: 204, corpo: null },
  erros: [404],
});

/**
 * Corpo de todo webhook de saída (ADR-023). Só identificadores em `dados`; o integrador consulta
 * o resto pela API. Assinatura em `PrejuZero-Assinatura: t=<segundos>,v1=<HMAC-SHA256 hex de
 * "t.corpo">`; `PrejuZero-Evento-Id` repete `id` para deduplicar.
 */
export const CorpoDoWebhook = nomear(
  'CorpoDoWebhook',
  z.object({
    id: z.uuid(),
    tipo: z.string(),
    versao: z.literal(1),
    ocorridoEm: z.iso.datetime(),
    dados: z.record(z.string(), z.string().nullable()),
  }),
);
export type CorpoDoWebhook = z.infer<typeof CorpoDoWebhook.esquema>;

export const EventosDeWebhook = nomear(
  'EventosDeWebhook',
  z.object({ itens: z.array(z.object({ tipo: z.string(), descricao: z.string() })) }),
);
export type EventosDeWebhook = z.infer<typeof EventosDeWebhook.esquema>;

const AssinaturaDeWebhookBase = z.object({
  id: z.uuid(),
  url: z.string(),
  descricao: z.string(),
  eventos: z.array(z.string()),
  criadoEm: z.iso.datetime(),
  desativadaEm: z.iso.datetime().nullable(),
});

export const AssinaturasDeWebhook = nomear(
  'AssinaturasDeWebhook',
  z.object({ itens: z.array(AssinaturaDeWebhookBase) }),
);
export type AssinaturasDeWebhook = z.infer<typeof AssinaturasDeWebhook.esquema>;

export const PedidoDeAssinaturaDeWebhook = nomear(
  'PedidoDeAssinaturaDeWebhook',
  z.object({
    url: z.string().min(1).max(2000).describe('HTTPS (HTTP só no ambiente local).'),
    descricao: z.string().trim().min(1).max(100),
    eventos: z.array(z.string().max(64)).min(1).max(20),
  }),
);

export const AssinaturaDeWebhookCriada = nomear(
  'AssinaturaDeWebhookCriada',
  z.object({
    assinatura: AssinaturaDeWebhookBase,
    segredo: z.string().describe('Segredo do HMAC: mostrado só agora; guarde em local seguro.'),
  }),
);
export type AssinaturaDeWebhookCriada = z.infer<typeof AssinaturaDeWebhookCriada.esquema>;

const EntregaDeWebhookBase = z.object({
  id: z.uuid(),
  assinaturaId: z.uuid(),
  eventoId: z.uuid(),
  tipo: z.string(),
  situacao: z.enum(['pendente', 'entregue', 'falhou']),
  tentativas: z.int().nonnegative(),
  ultimoStatus: z.int().nullable(),
  ultimoErro: z.string().nullable(),
  criadoEm: z.iso.datetime(),
  entregueEm: z.iso.datetime().nullable(),
});

export const EntregaDeWebhook = nomear('EntregaDeWebhook', EntregaDeWebhookBase);
export type EntregaDeWebhook = z.infer<typeof EntregaDeWebhook.esquema>;

export const EntregasDeWebhook = nomear(
  'EntregasDeWebhook',
  z.object({ itens: z.array(EntregaDeWebhookBase) }),
);
export type EntregasDeWebhook = z.infer<typeof EntregasDeWebhook.esquema>;

export const listarEventosDeWebhook = definirRota({
  id: 'listarEventosDeWebhook',
  metodo: 'get',
  caminho: '/v1/integracoes/webhooks/eventos',
  resumo: 'Eventos que um webhook pode assinar.',
  tag: 'integracoes',
  resposta: { status: 200, corpo: EventosDeWebhook },
});

export const listarAssinaturasDeWebhook = definirRota({
  id: 'listarAssinaturasDeWebhook',
  metodo: 'get',
  caminho: '/v1/integracoes/webhooks',
  resumo: 'Webhooks de saída do escritório.',
  tag: 'integracoes',
  resposta: { status: 200, corpo: AssinaturasDeWebhook },
});

export const registrarAssinaturaDeWebhook = definirRota({
  id: 'registrarAssinaturaDeWebhook',
  metodo: 'post',
  caminho: '/v1/integracoes/webhooks',
  resumo: 'Registra um webhook de saída e devolve o segredo do HMAC uma única vez.',
  tag: 'integracoes',
  corpo: PedidoDeAssinaturaDeWebhook,
  resposta: { status: 201, corpo: AssinaturaDeWebhookCriada },
});

export const desativarAssinaturaDeWebhook = definirRota({
  id: 'desativarAssinaturaDeWebhook',
  metodo: 'delete',
  caminho: '/v1/integracoes/webhooks/{id}',
  resumo: 'Desativa o webhook: novos eventos deixam de ser enviados.',
  tag: 'integracoes',
  parametrosDeCaminho: z.object({ id: z.uuid() }),
  resposta: { status: 204, corpo: null },
  erros: [404],
});

export const testarAssinaturaDeWebhook = definirRota({
  id: 'testarAssinaturaDeWebhook',
  metodo: 'post',
  caminho: '/v1/integracoes/webhooks/{id}/testar',
  resumo: 'Envia um evento `webhook.teste` ao endereço do webhook.',
  tag: 'integracoes',
  parametrosDeCaminho: z.object({ id: z.uuid() }),
  resposta: { status: 202, corpo: EntregaDeWebhook },
  erros: [404, 409],
});

export const listarEntregasDeWebhook = definirRota({
  id: 'listarEntregasDeWebhook',
  metodo: 'get',
  caminho: '/v1/integracoes/webhooks/entregas',
  resumo: 'Entregas recentes (inclui as que falharam), mais novas primeiro.',
  tag: 'integracoes',
  consulta: z.object({
    assinaturaId: z.uuid().optional(),
    limite: z.coerce.number().int().min(1).max(200).optional(),
  }),
  resposta: { status: 200, corpo: EntregasDeWebhook },
});

export const reenviarEntregaDeWebhook = definirRota({
  id: 'reenviarEntregaDeWebhook',
  metodo: 'post',
  caminho: '/v1/integracoes/webhooks/entregas/{id}/reenviar',
  resumo: 'Reenvia uma entrega que falhou.',
  tag: 'integracoes',
  parametrosDeCaminho: z.object({ id: z.uuid() }),
  resposta: { status: 204, corpo: null },
  erros: [404, 409],
});

/** Pedido de autorização (OAuth 2.1, seção 4.1.1), como chega à tela de consentimento. */
export const PedidoDeAutorizacaoOAuth = nomear(
  'PedidoDeAutorizacaoOAuth',
  z.object({
    response_type: z.string().max(20),
    client_id: z.uuid(),
    redirect_uri: z.string().max(2000),
    scope: z.string().max(1000).optional(),
    state: z.string().max(500).optional(),
    code_challenge: z.string().max(128),
    code_challenge_method: z.string().max(10),
  }),
);
export type PedidoDeAutorizacaoOAuth = z.infer<typeof PedidoDeAutorizacaoOAuth.esquema>;

export const DescricaoDaAutorizacaoOAuth = nomear(
  'DescricaoDaAutorizacaoOAuth',
  z.object({
    cliente: z.object({ id: z.uuid(), nome: z.string() }),
    registroAutomatico: z
      .boolean()
      .describe('O assistente se registrou sozinho (HU60): nome não verificado pelo escritório.'),
    redirectUri: z.string(),
    escopos: z.array(z.object({ escopo: z.string(), descricao: z.string() })),
  }),
);
export type DescricaoDaAutorizacaoOAuth = z.infer<typeof DescricaoDaAutorizacaoOAuth.esquema>;

export const AutorizacaoOAuthConcedida = nomear(
  'AutorizacaoOAuthConcedida',
  z.object({ redirecionarPara: z.string().describe('Retorno do app com `code` e `state`.') }),
);
export type AutorizacaoOAuthConcedida = z.infer<typeof AutorizacaoOAuthConcedida.esquema>;

export const descreverAutorizacaoOAuth = definirRota({
  id: 'descreverAutorizacaoOAuth',
  metodo: 'get',
  caminho: '/v1/oauth/autorizacao',
  resumo: 'Confere o pedido de autorização e descreve o que o app pede (tela de consentimento).',
  tag: 'integracoes',
  consulta: PedidoDeAutorizacaoOAuth.esquema,
  resposta: { status: 200, corpo: DescricaoDaAutorizacaoOAuth },
});

export const autorizarClienteOAuth = definirRota({
  id: 'autorizarClienteOAuth',
  metodo: 'post',
  caminho: '/v1/oauth/autorizacao',
  resumo: 'O usuário permite: emite o código (uso único) e devolve o endereço de retorno.',
  tag: 'integracoes',
  corpo: PedidoDeAutorizacaoOAuth,
  resposta: { status: 200, corpo: AutorizacaoOAuthConcedida },
});

/** Registro dinâmico de cliente (HU60, RFC 7591): só cliente público com PKCE. */
export const PedidoDeRegistroOAuth = nomear(
  'PedidoDeRegistroOAuth',
  z.object({
    redirect_uris: z.array(z.string().max(2000)).min(1).max(5),
    client_name: z.string().max(200).optional(),
    token_endpoint_auth_method: z.string().max(50).optional(),
    grant_types: z.array(z.string().max(50)).max(5).optional(),
    response_types: z.array(z.string().max(50)).max(5).optional(),
    scope: z.string().max(1000).optional(),
  }),
);
export type PedidoDeRegistroOAuth = z.infer<typeof PedidoDeRegistroOAuth.esquema>;

export const RegistroOAuth = nomear(
  'RegistroOAuth',
  z.object({
    client_id: z.uuid(),
    client_id_issued_at: z.int().describe('Segundos desde 1970 (RFC 7591).'),
    client_name: z.string(),
    redirect_uris: z.array(z.string()),
    token_endpoint_auth_method: z.literal('none'),
    grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])),
    response_types: z.array(z.literal('code')),
    scope: z.string().describe('Escopos de leitura possíveis; o advogado concede os que tem.'),
  }),
);
export type RegistroOAuth = z.infer<typeof RegistroOAuth.esquema>;

export const registrarClienteOAuthDinamico = definirRota({
  id: 'registrarClienteOAuthDinamico',
  metodo: 'post',
  caminho: '/v1/oauth/registro',
  resumo:
    'Registro dinâmico de cliente (RFC 7591) para assistentes de IA: público, PKCE, só leitura e sem acesso até o advogado autorizar.',
  tag: 'integracoes',
  corpo: PedidoDeRegistroOAuth,
  resposta: { status: 201, corpo: RegistroOAuth },
  erros: [429],
});

/** Metadados do servidor de autorização (RFC 8414), sem o `issuer` (o do recurso, HU60). */
export const MetadadosOAuth = nomear(
  'MetadadosOAuth',
  z.object({
    authorization_endpoint: z.url(),
    token_endpoint: z.url(),
    registration_endpoint: z.url(),
    scopes_supported: z.array(z.string()),
    response_types_supported: z.array(z.literal('code')),
    grant_types_supported: z.array(z.string()),
    code_challenge_methods_supported: z.array(z.literal('S256')),
    token_endpoint_auth_methods_supported: z.array(z.string()),
  }),
);
export type MetadadosOAuth = z.infer<typeof MetadadosOAuth.esquema>;

export const consultarMetadadosOAuth = definirRota({
  id: 'consultarMetadadosOAuth',
  metodo: 'get',
  caminho: '/v1/oauth/metadados',
  resumo: 'Endereços e capacidades do servidor de autorização (RFC 8414), para o servidor MCP.',
  tag: 'integracoes',
  resposta: { status: 200, corpo: MetadadosOAuth },
});

export const ROTAS_INTEGRACOES = [
  emitirTokenOAuth,
  descreverAutorizacaoOAuth,
  autorizarClienteOAuth,
  listarEscoposDeIntegracao,
  listarClientesDeIntegracao,
  registrarClienteDeIntegracao,
  registrarAppOAuth,
  revogarClienteDeIntegracao,
  listarEventosDeWebhook,
  listarAssinaturasDeWebhook,
  registrarAssinaturaDeWebhook,
  desativarAssinaturaDeWebhook,
  testarAssinaturaDeWebhook,
  listarEntregasDeWebhook,
  reenviarEntregaDeWebhook,
  registrarClienteOAuthDinamico,
  consultarMetadadosOAuth,
] as const;
