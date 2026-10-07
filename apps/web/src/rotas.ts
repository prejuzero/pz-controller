/** Rotas do portal que não exigem sessão. */
export const ROTA_ENTRAR = '/entrar';
export const ROTA_SEGUNDO_FATOR = '/entrar/2fa';
export const ROTA_RECUPERAR_SENHA = '/recuperar-senha';
// O caminho vem do e-mail de redefinição (modules/identidade/application/avisos.ts).
export const ROTA_REDEFINIR_SENHA = '/redefinir-senha';
export const ROTA_SEGURANCA = '/configuracoes/seguranca';
export const ROTA_CADASTRO = '/cadastro';
// O caminho vem do e-mail de boas-vindas (modules/identidade/application/avisos.ts).
export const ROTA_VERIFICAR_EMAIL = '/verificar-email';
const ROTAS_PUBLICAS = [
  ROTA_ENTRAR,
  ROTA_RECUPERAR_SENHA,
  ROTA_REDEFINIR_SENHA,
  ROTA_CADASTRO,
  ROTA_VERIFICAR_EMAIL,
];

export type MotivoEntrar = 'sessao-expirada' | 'senha-redefinida';

export function ehRotaPublica(caminho: string): boolean {
  return ROTAS_PUBLICAS.some((rota) => caminho === rota || caminho.startsWith(`${rota}/`));
}

/**
 * Só aceita caminho interno ("/..."): evita redirecionamento aberto via `?retorno=` (OWASP ASVS
 * 5.1.5). `//host` e `/\host` seriam interpretados pelo navegador como outra origem.
 */
export function retornoSeguro(valor: string | null | undefined): string {
  if (valor?.startsWith('/') !== true || valor.startsWith('//') || valor.startsWith('/\\'))
    return '/';
  return valor;
}

/** URL da tela de entrada preservando para onde voltar depois do login. */
export function urlEntrar(retorno: string, motivo?: MotivoEntrar): string {
  const parametros = new URLSearchParams();
  const destino = retornoSeguro(retorno);
  if (destino !== '/') parametros.set('retorno', destino);
  if (motivo !== undefined) parametros.set('motivo', motivo);
  const consulta = parametros.toString();
  return consulta === '' ? ROTA_ENTRAR : `${ROTA_ENTRAR}?${consulta}`;
}

/** Depois da senha ou do 2FA: falta um passo da sessão → tela do 2FA; senão, volta ao destino. */
export function destinoAposEntrar(
  proximoPasso: 'configurar-2fa' | 'verificar-2fa' | null,
  retorno: string | null | undefined,
): string {
  const destino = retornoSeguro(retorno);
  if (proximoPasso === null) return destino;
  return destino === '/'
    ? ROTA_SEGUNDO_FATOR
    : `${ROTA_SEGUNDO_FATOR}?${new URLSearchParams({ retorno: destino }).toString()}`;
}

/**
 * Token do link de redefinição. Vem no fragmento (`#token=...`), que o navegador não envia ao
 * servidor nem grava em logs de acesso.
 */
export function tokenDoFragmento(fragmento: string): string | undefined {
  const token = new URLSearchParams(fragmento.replace(/^#/, '')).get('token');
  return token === null || token === '' ? undefined : token;
}
