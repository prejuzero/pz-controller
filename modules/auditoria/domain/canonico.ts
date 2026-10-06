/**
 * JSON canônico (RFC 8785, JCS): chaves ordenadas por unidades UTF-16, sem espaços, números e
 * strings como no `JSON.stringify` do ECMAScript (que a RFC adota). O mesmo registro gera
 * sempre os mesmos bytes, então o hash não depende da ordem dos campos.
 */
export function jsonCanonico(valor: unknown): string {
  if (valor === null || typeof valor === 'boolean' || typeof valor === 'string') {
    return JSON.stringify(valor);
  }
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new Error('JSON canônico não aceita NaN nem Infinity');
    return JSON.stringify(valor);
  }
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  if (typeof valor === 'object') {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entradas.map(([chave, item]) => `${JSON.stringify(chave)}:${jsonCanonico(item)}`).join(',')}}`;
  }
  throw new Error(`JSON canônico não aceita ${typeof valor}`);
}
