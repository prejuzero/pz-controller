import { z } from 'zod';

import { Instante, Uuid } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

/** Cookies da sessão no navegador (HU06) e o cabeçalho que repete o token CSRF (double-submit). */
export const COOKIE_SESSAO = '__Host-pz_sessao';
export const COOKIE_CSRF = '__Host-pz_csrf';
export const CABECALHO_CSRF = 'x-csrf-token';

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
      .enum(['configurar-2fa', 'verificar-2fa', 'aceitar-termos'])
      .nullable()
      .describe(
        'O que falta antes de usar o sistema; null quando nada. `aceitar-termos`: versão nova de documento legal (GET /v1/termos/pendentes).',
      ),
    permissoes: z
      .array(z.string())
      .describe(
        'Permissões efetivas (catálogo da HU07, ex.: `prazos:ler`), também usadas como escopos OAuth. Vazio sem o 2FA. O portal só oculta ações; a API sempre confere.',
      ),
    impersonacao: z
      .object({
        tenantId: Uuid.describe('Tenant acessado; as requisições rodam nele, só para leitura.'),
        motivo: z.string(),
        expiraEm: Instante,
      })
      .nullable()
      .optional()
      .describe(
        'Impersonação em curso (HU07): o portal mostra a faixa enquanto houver. Ausente ou null fora dela.',
      ),
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
  erros: [401, 429],
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

export const AcessosRecentes = nomear(
  'AcessosRecentes',
  z.object({
    itens: z.array(
      z.object({
        tipo: z.enum(['login', 'segundo-fator', 'logout', 'bloqueio']),
        sucesso: z.boolean(),
        ip: z.string(),
        userAgent: z.string(),
        ocorridoEm: z.iso.datetime(),
      }),
    ),
  }),
);
export type AcessosRecentes = z.infer<typeof AcessosRecentes.esquema>;

/** Últimos 20 acessos do próprio usuário (Configurações > Segurança). */
export const listarAcessos = definirRota({
  id: 'listarAcessos',
  metodo: 'get',
  caminho: '/v1/auth/acessos',
  resumo: 'Últimos acessos da conta (logins, 2FA, saídas e bloqueios).',
  tag: 'auth',
  resposta: { status: 200, corpo: AcessosRecentes },
});

export const PedidoDeRedefinicaoDeSenha = nomear(
  'PedidoDeRedefinicaoDeSenha',
  z.object({ email: z.string().min(1).max(254) }),
);

export const RedefinicaoDeSenha = nomear(
  'RedefinicaoDeSenha',
  z.object({
    token: z.string().min(20).max(200).describe('Token do link enviado por e-mail.'),
    novaSenha: z.string().min(1).max(512),
  }),
);

/** Sempre 204, exista ou não o e-mail (não revela contas). O link vale 30 min, uma vez. */
export const solicitarRedefinicaoDeSenha = definirRota({
  id: 'solicitarRedefinicaoDeSenha',
  metodo: 'post',
  caminho: '/v1/auth/senha/esqueci',
  resumo: 'Envia o link de redefinição de senha, se o e-mail tiver conta.',
  tag: 'auth',
  publica: true,
  corpo: PedidoDeRedefinicaoDeSenha,
  resposta: { status: 204, corpo: null },
  erros: [429],
});

/** Troca a senha com o token do e-mail; revoga todas as sessões e desbloqueia o login. */
export const redefinirSenha = definirRota({
  id: 'redefinirSenha',
  metodo: 'post',
  caminho: '/v1/auth/senha/redefinir',
  resumo: 'Define a nova senha com o token recebido por e-mail.',
  tag: 'auth',
  publica: true,
  corpo: RedefinicaoDeSenha,
  resposta: { status: 204, corpo: null },
  erros: [401, 429],
});

const TipoCliente = z.enum(['web', 'mobile', 'mcp', 'integrador']);

export const PedidoDeTokensDeDispositivo = nomear(
  'PedidoDeTokensDeDispositivo',
  z.object({ tipoCliente: TipoCliente, nomeDispositivo: z.string().min(1).max(100) }),
);

export const TokensDeDispositivo = nomear(
  'TokensDeDispositivo',
  z.object({
    dispositivoId: z.uuid(),
    tokenDeAcesso: z.string().describe('Bearer de 15 min.'),
    acessoExpiraEm: z.iso.datetime(),
    tokenDeRenovacao: z.string().describe('Uso único; reutilizar revoga o dispositivo.'),
    renovacaoExpiraEm: z.iso.datetime(),
  }),
);
export type TokensDeDispositivo = z.infer<typeof TokensDeDispositivo.esquema>;

export const PedidoDeRenovacao = nomear(
  'PedidoDeRenovacao',
  z.object({ tokenDeRenovacao: z.string().min(20).max(200) }),
);

export const DispositivosDaConta = nomear(
  'DispositivosDaConta',
  z.object({
    itens: z.array(
      z.object({
        id: z.uuid(),
        tipoCliente: TipoCliente,
        nome: z.string(),
        criadoEm: z.iso.datetime(),
        ultimoUso: z.iso.datetime(),
        revogadaEm: z.iso.datetime().nullable(),
      }),
    ),
  }),
);
export type DispositivosDaConta = z.infer<typeof DispositivosDaConta.esquema>;

/** Tokens para clientes que não são navegador (app, MCP, integrador); exige sessão completa. */
export const emitirTokensDeDispositivo = definirRota({
  id: 'emitirTokensDeDispositivo',
  metodo: 'post',
  caminho: '/v1/auth/tokens',
  resumo: 'Registra o dispositivo e emite token de acesso curto e de renovação.',
  tag: 'auth',
  corpo: PedidoDeTokensDeDispositivo,
  resposta: { status: 201, corpo: TokensDeDispositivo },
});

/** Troca o token de renovação por um par novo (rotação). */
export const renovarTokens = definirRota({
  id: 'renovarTokens',
  metodo: 'post',
  caminho: '/v1/auth/tokens/renovar',
  resumo: 'Renova os tokens do dispositivo; o de renovação usado deixa de valer.',
  tag: 'auth',
  publica: true,
  corpo: PedidoDeRenovacao,
  resposta: { status: 200, corpo: TokensDeDispositivo },
  erros: [401, 429],
});

export const listarDispositivos = definirRota({
  id: 'listarDispositivos',
  metodo: 'get',
  caminho: '/v1/auth/dispositivos',
  resumo: 'Dispositivos com sessão na conta.',
  tag: 'auth',
  resposta: { status: 200, corpo: DispositivosDaConta },
});

export const revogarDispositivo = definirRota({
  id: 'revogarDispositivo',
  metodo: 'delete',
  caminho: '/v1/auth/dispositivos/{id}',
  resumo: 'Encerra a sessão de um dispositivo na hora.',
  tag: 'auth',
  parametrosDeCaminho: z.object({ id: z.uuid() }),
  resposta: { status: 204, corpo: null },
  erros: [404],
});

export const ROTAS_AUTH = [
  entrar,
  sair,
  consultarSessao,
  configurarSegundoFator,
  ativarSegundoFator,
  verificarSegundoFator,
  listarAcessos,
  solicitarRedefinicaoDeSenha,
  redefinirSenha,
  emitirTokensDeDispositivo,
  renovarTokens,
  listarDispositivos,
  revogarDispositivo,
] as const;
