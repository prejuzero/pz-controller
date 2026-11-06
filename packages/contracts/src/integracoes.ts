import { z } from 'zod';

import { definirRota, nomear } from './rota.js';

/**
 * Pedido de token do Client Credentials (RFC 6749, seção 4.4; OAuth 2.1). Campos em snake_case
 * por serem os nomes do padrão. O segredo pode vir aqui ou no cabeçalho `Authorization: Basic`.
 */
export const PedidoDeTokenOAuth = nomear(
  'PedidoDeTokenOAuth',
  z.object({
    grant_type: z.literal('client_credentials'),
    client_id: z.uuid().optional(),
    client_secret: z.string().min(20).max(200).optional(),
    scope: z.string().max(1000).optional().describe('Escopos separados por espaço.'),
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

export const ROTAS_INTEGRACOES = [
  emitirTokenOAuth,
  listarEscoposDeIntegracao,
  listarClientesDeIntegracao,
  registrarClienteDeIntegracao,
  revogarClienteDeIntegracao,
  listarEventosDeWebhook,
  listarAssinaturasDeWebhook,
  registrarAssinaturaDeWebhook,
  desativarAssinaturaDeWebhook,
  testarAssinaturaDeWebhook,
  listarEntregasDeWebhook,
  reenviarEntregaDeWebhook,
] as const;
