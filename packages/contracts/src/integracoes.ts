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

export const ROTAS_INTEGRACOES = [
  emitirTokenOAuth,
  listarEscoposDeIntegracao,
  listarClientesDeIntegracao,
  registrarClienteDeIntegracao,
  revogarClienteDeIntegracao,
] as const;
