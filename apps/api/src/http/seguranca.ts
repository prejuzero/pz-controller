import type { FastifyInstance } from 'fastify';

/** Painel das filas (HU10): HTML próprio, servido pela API com a guarda dela. */
const PAINEL_DAS_FILAS = '/admin/filas';

/**
 * Cabeçalhos de segurança em toda resposta da API (HU37, PZ-218; OWASP ASVS nível 2). A API só
 * devolve JSON: nada dela é carregado como página, script ou quadro. Respostas trazem dados do
 * escritório, então nenhum intermediário as guarda (no-store).
 */
export function registrarCabecalhosDeSeguranca(
  servidor: FastifyInstance,
  opcoes: { readonly producao: boolean },
): void {
  servidor.addHook('onSend', (requisicao, resposta, carga, pronto) => {
    void resposta.header('x-content-type-options', 'nosniff');
    void resposta.header('x-frame-options', 'DENY');
    void resposta.header('referrer-policy', 'no-referrer');
    void resposta.header('cross-origin-resource-policy', 'same-origin');
    if (!requisicao.url.startsWith(PAINEL_DAS_FILAS)) {
      void resposta.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    }
    if (resposta.getHeader('cache-control') === undefined) {
      void resposta.header('cache-control', 'no-store');
    }
    if (opcoes.producao) {
      void resposta.header(
        'strict-transport-security',
        'max-age=63072000; includeSubDomains; preload',
      );
    }
    pronto(null, carga);
  });
}

/**
 * CORS (HU37): o portal chama a API na mesma origem (src/proxy.ts do web), então, por padrão,
 * nenhuma origem cruzada é aceita. Só as origens listadas em CORS_ORIGENS recebem os cabeçalhos.
 */
export function origensPermitidas(lista: string | undefined): string[] {
  return (lista ?? '')
    .split(',')
    .map((origem) => origem.trim())
    .filter((origem) => origem !== '');
}
