import { gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { CredenciaisEmMemoria, SessoesEmMemoria } from './em-memoria.js';

import type { Email } from '../domain/credenciais.js';
import type { Sessao } from '../domain/sessao.js';

describe('dublês em memória (testes das apps)', () => {
  it('credenciais: localiza pelo e-mail e troca a senha só do usuário certo', async () => {
    const credenciais = new CredenciaisEmMemoria();
    const [ana, bia, tenant] = [gerarUuidV7(), gerarUuidV7(), gerarUuidV7()];
    credenciais.cadastrar('ana@x.invalid' as Email, {
      usuarioId: ana,
      tenantId: tenant,
      senhaHash: null,
    });
    credenciais.cadastrar('bia@x.invalid' as Email, {
      usuarioId: bia,
      tenantId: tenant,
      senhaHash: null,
    });
    await credenciais.definirSenha(ana, 'hash');
    expect((await credenciais.localizarPorEmail('ana@x.invalid' as Email))?.senhaHash).toBe('hash');
    expect((await credenciais.localizarPorEmail('bia@x.invalid' as Email))?.senhaHash).toBeNull();
    expect(await credenciais.localizarPorEmail('ninguem@x.invalid' as Email)).toBeUndefined();
  });

  it('sessões: grava, obtém, remove uma e todas do usuário', async () => {
    const sessoes = new SessoesEmMemoria();
    const agora = Instant.deEpochMs(0);
    const nova = (usuarioId = gerarUuidV7()): Sessao => ({
      id: gerarUuidV7(),
      usuarioId,
      tenantId: gerarUuidV7(),
      nivel: 'senha',
      criadaEm: agora,
      ultimoUso: agora,
    });
    const ana = gerarUuidV7();
    await sessoes.gravar('a1', nova(ana));
    await sessoes.gravar('a2', nova(ana));
    await sessoes.gravar('b1', nova());
    await sessoes.remover('a1');
    expect(await sessoes.obter('a1')).toBeUndefined();
    await sessoes.removerTodasDoUsuario(ana);
    expect(await sessoes.obter('a2')).toBeUndefined();
    expect(await sessoes.obter('b1')).toBeDefined();
  });
});
