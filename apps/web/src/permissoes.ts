/**
 * Controle de acesso no portal (HU07). Só oculta o que o usuário não pode usar: a API sempre
 * confere a permissão (`@RequerPermissao`), e o portal nunca é a única barreira.
 * Os nomes seguem o catálogo de modules/identidade/domain/permissoes.ts (ex.: `prazos:ler`).
 */
export type Exigencia = string | readonly string[] | { readonly algum: readonly string[] };

/**
 * Mesma regra do back (`concede`): todas as exigidas presentes; lista vazia não concede nada.
 * `{ algum }` vale para telas que servem a perfis diferentes (ex.: Calendário para o escritório e
 * para a curadoria); cada ação dentro delas continua com a própria permissão.
 */
export function permite(tem: readonly string[], exigencia: Exigencia): boolean {
  if (typeof exigencia === 'object' && 'algum' in exigencia)
    return exigencia.algum.some((p) => tem.includes(p));
  const exigidas = typeof exigencia === 'string' ? [exigencia] : exigencia;
  return exigidas.length > 0 && exigidas.every((p) => tem.includes(p));
}

function ehExigencia(valor: unknown): valor is Exigencia {
  if (typeof valor === 'string') return true;
  if (Array.isArray(valor)) return valor.every((p) => typeof p === 'string');
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'algum' in valor &&
    Array.isArray(valor.algum) &&
    valor.algum.every((p) => typeof p === 'string')
  );
}

/** Itens sem `permissao` ficam sempre visíveis; os demais, só com a permissão concedida. */
export function filtrarPermitidos<T extends object>(
  itens: readonly T[],
  tem: readonly string[],
): T[] {
  return itens.filter(
    (item) =>
      !('permissao' in item) || (ehExigencia(item.permissao) && permite(tem, item.permissao)),
  );
}
