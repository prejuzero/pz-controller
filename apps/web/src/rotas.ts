/** Rotas do portal que não exigem sessão. */
export const ROTA_ENTRAR = '/entrar';
const ROTAS_PUBLICAS = [ROTA_ENTRAR];

export type MotivoEntrar = 'sessao-expirada';

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
