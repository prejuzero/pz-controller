import { z } from 'zod';

import { Uuid } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

export const Credenciais = nomear(
  'Credenciais',
  z.object({
    email: z.string().min(1).max(254),
    // Sem a política de senha aqui: o login não revela regras nem diferencia erros.
    senha: z.string().min(1).max(128),
  }),
);
export type Credenciais = z.infer<typeof Credenciais.esquema>;

export const SessaoAtual = nomear(
  'SessaoAtual',
  z.object({
    usuarioId: Uuid,
    tenantId: Uuid,
    nivel: z
      .enum(['senha', 'completo'])
      .describe('`senha`: falta o 2FA; `completo`: senha e 2FA verificados.'),
    proximoPasso: z
      .enum(['configurar-2fa', 'verificar-2fa'])
      .nullable()
      .describe('O que falta para a sessão ficar completa; null quando já está.'),
  }),
);
export type SessaoAtual = z.infer<typeof SessaoAtual.esquema>;

/**
 * Login (HU06): cria a sessão opaca no cookie `__Host-pz_sessao` (HttpOnly, Secure, SameSite=Lax)
 * e o token CSRF no cookie `__Host-pz_csrf`, a ser repetido no cabeçalho `x-csrf-token`.
 * Falha sempre como 401 genérico (não revela se o e-mail existe).
 */
export const entrar = definirRota({
  id: 'entrar',
  metodo: 'post',
  caminho: '/v1/auth/entrar',
  resumo: 'Entra com e-mail e senha; a sessão nasce aguardando o 2FA.',
  tag: 'auth',
  publica: true,
  corpo: Credenciais,
  resposta: { status: 200, corpo: SessaoAtual },
  erros: [401],
});

export const sair = definirRota({
  id: 'sair',
  metodo: 'post',
  caminho: '/v1/auth/sair',
  resumo: 'Encerra a sessão atual.',
  tag: 'auth',
  resposta: { status: 204, corpo: null },
});

export const consultarSessao = definirRota({
  id: 'consultarSessao',
  metodo: 'get',
  caminho: '/v1/auth/eu',
  resumo: 'Usuário, tenant e nível da sessão atual.',
  tag: 'auth',
  resposta: { status: 200, corpo: SessaoAtual },
});

export const ConfiguracaoSegundoFator = nomear(
  'ConfiguracaoSegundoFator',
  z.object({
    uri: z.string().describe('URI otpauth:// para o QR code do aplicativo autenticador.'),
    segredo: z.string().describe('O mesmo segredo, para digitar manualmente.'),
  }),
);

export type ConfiguracaoSegundoFator = z.infer<typeof ConfiguracaoSegundoFator.esquema>;

export const CodigoSegundoFator = nomear(
  'CodigoSegundoFator',
  z.object({
    codigo: z
      .string()
      .min(6)
      .max(16)
      .describe('6 dígitos do aplicativo ou um código de recuperação (XXXXX-XXXXX).'),
  }),
);

export const SegundoFatorAtivado = nomear(
  'SegundoFatorAtivado',
  z.object({
    sessao: SessaoAtual.esquema,
    codigosDeRecuperacao: z
      .array(z.string())
      .length(10)
      .describe('Exibidos só agora: cada um vale uma vez se o celular for perdido.'),
  }),
);

export type SegundoFatorAtivado = z.infer<typeof SegundoFatorAtivado.esquema>;

/** 2FA (HU06): gera o segredo TOTP; exige sessão de senha, sem 2FA ativo. */
export const configurarSegundoFator = definirRota({
  id: 'configurarSegundoFator',
  metodo: 'post',
  caminho: '/v1/auth/2fa/configurar',
  resumo: 'Gera o segredo TOTP e a URI do QR code.',
  tag: 'auth',
  resposta: { status: 200, corpo: ConfiguracaoSegundoFator },
  erros: [409],
});

/** Ativa o 2FA com o primeiro código; a sessão fica completa (novo token). */
export const ativarSegundoFator = definirRota({
  id: 'ativarSegundoFator',
  metodo: 'post',
  caminho: '/v1/auth/2fa/ativar',
  resumo: 'Ativa o 2FA e devolve os códigos de recuperação.',
  tag: 'auth',
  corpo: CodigoSegundoFator,
  resposta: { status: 200, corpo: SegundoFatorAtivado },
  erros: [409],
});

/** Verifica o 2FA após a senha; a sessão fica completa (novo token). */
export const verificarSegundoFator = definirRota({
  id: 'verificarSegundoFator',
  metodo: 'post',
  caminho: '/v1/auth/2fa/verificar',
  resumo: 'Verifica o código do aplicativo ou de recuperação.',
  tag: 'auth',
  corpo: CodigoSegundoFator,
  resposta: { status: 200, corpo: SessaoAtual },
});

export const ROTAS_AUTH = [
  entrar,
  sair,
  consultarSessao,
  configurarSegundoFator,
  ativarSegundoFator,
  verificarSegundoFator,
] as const;
