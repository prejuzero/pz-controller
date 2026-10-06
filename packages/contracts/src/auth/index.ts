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

export const ROTAS_AUTH = [entrar, sair, consultarSessao] as const;
