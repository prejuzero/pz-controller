import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Todos os .tsx do portal (fora os testes). */
function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return nome.endsWith('.tsx') && !nome.includes('.test.') ? [caminho] : [];
  });
}

describe('formulários (HU37, DAST)', () => {
  it('todo <form> usa method="post": antes do JavaScript, nada vai para a URL', () => {
    const semPost = arquivos(join(import.meta.dirname, 'app')).flatMap((arquivo) =>
      [...readFileSync(arquivo, 'utf8').matchAll(/<form\b[^>]*>/g)]
        .filter((m) => !m[0].includes('method="post"'))
        .map(() => arquivo),
    );
    expect(semPost).toEqual([]);
  });
});
