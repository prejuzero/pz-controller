import { describe, expect, it } from 'vitest';

import { autorizar, temPermissao } from './autorizacao.js';

import type { Ator, Politica } from './autorizacao.js';
import type { Uuid } from './uuid.js';

const ator: Ator = {
  usuarioId: '0192a000-0000-7000-8000-000000000001' as Uuid,
  tenantId: '0192a000-0000-7000-8000-0000000000aa' as Uuid,
  permissoes: new Set(['prazos:ler']),
};

/** Exemplo de política por recurso: só o responsável altera o próprio item. */
const doResponsavel: Politica<{ responsavelId: Uuid }> = {
  permite: (quem, recurso) => quem.usuarioId === recurso.responsavelId,
};

describe('autorização no domínio', () => {
  it('temPermissao confere o conjunto do ator', () => {
    expect(temPermissao(ator, 'prazos:ler')).toBe(true);
    expect(temPermissao(ator, 'prazos:confirmar')).toBe(false);
  });

  it('autorizar devolve Proibido quando a política nega e ok quando permite', () => {
    const negado = autorizar(doResponsavel, ator, { responsavelId: ator.tenantId });
    expect(negado.ok).toBe(false);
    if (!negado.ok) expect(negado.erro.categoria).toBe('proibido');
    expect(autorizar(doResponsavel, ator, { responsavelId: ator.usuarioId }).ok).toBe(true);
  });
});
