/**
 * Controle de acesso no portal (HU07). Só oculta o que o usuário não pode usar: a API sempre
 * confere a permissão (`@RequerPermissao`), e o portal nunca é a única barreira.
 * Os nomes seguem o catálogo de modules/identidade/domain/permissoes.ts (ex.: `prazos:ler`).
 */
export type Exigencia = string | readonly string[];

/** Mesma regra do back (`concede`): todas as exigidas presentes; lista vazia não concede nada. */
export function permite(tem: readonly string[], exigencia: Exigencia): boolean {
  const exigidas = typeof exigencia === 'string' ? [exigencia] : exigencia;
  return exigidas.length > 0 && exigidas.every((p) => tem.includes(p));
}

/** Itens sem `permissao` ficam sempre visíveis; os demais, só com a permissão concedida. */
export function filtrarPermitidos<T extends object>(
  itens: readonly T[],
  tem: readonly string[],
): T[] {
  return itens.filter(
    (item) =>
      !('permissao' in item) ||
      (typeof item.permissao === 'string' && permite(tem, item.permissao)),
  );
}
