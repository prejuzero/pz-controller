/**
 * Marca da entrada (HU34): o alerta de prazos sem ciência aparece logo depois do login, uma vez.
 * Fica na sessão da aba; sem armazenamento (navegação privada), o alerta só não aparece e a faixa
 * de avisos continua avisando.
 */
const CHAVE = 'pz:acabou-de-entrar';

export function marcarEntrada(): void {
  try {
    sessionStorage.setItem(CHAVE, '1');
  } catch {
    // Sem armazenamento: a faixa persistente segue avisando.
  }
}

/** `true` uma vez depois da entrada; a marca some na leitura. */
export function consumirEntrada(): boolean {
  try {
    const marcada = sessionStorage.getItem(CHAVE) !== null;
    sessionStorage.removeItem(CHAVE);
    return marcada;
  } catch {
    return false;
  }
}
