import { Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ListarSupressoes } from '../application/supressoes.js';

import { SupressoesEmMemoria } from './em-memoria.js';

describe('rejeições de e-mail para o administrador (HU39)', () => {
  it('pagina por e-mail', async () => {
    const supressoes = new SupressoesEmMemoria();
    const criadaEm = Instant.deIso('2026-10-08T12:00:00Z');
    supressoes.itens.push(
      { email: 'b@exemplo.invalid', motivo: 'spam', criadaEm },
      { email: 'a@exemplo.invalid', motivo: 'bounce', criadaEm },
    );
    const listar = new ListarSupressoes(new OutboxEmMemoria(), supressoes);
    const primeira = await listar.executar({ limite: 1 });
    expect(primeira).toMatchObject({
      itens: [{ email: 'a@exemplo.invalid' }],
      proximoCursor: 'a@exemplo.invalid',
    });
    expect(await listar.executar({ limite: 1, apos: 'a@exemplo.invalid' })).toMatchObject({
      itens: [{ email: 'b@exemplo.invalid' }],
      proximoCursor: null,
    });
  });
});
