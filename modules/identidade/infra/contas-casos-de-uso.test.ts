import { describe, expect, it } from 'vitest';

import { CriarConta } from '../application/contas.js';

import type { ContaNova, RepositorioDeContas } from '../application/contas.js';
import type { HasherDeSenha } from '../application/portas.js';
import type { Uuid } from '@pz/kernel';

const hasher: HasherDeSenha = {
  gerar: (senha) => Promise.resolve(`hash:${senha.length.toString()}`),
  verificar: () => Promise.resolve(false),
};

class ContasEmMemoria implements RepositorioDeContas<object> {
  readonly contas: ContaNova[] = [];
  criar(_tx: object, conta: ContaNova) {
    if (this.contas.some((c) => c.email === conta.email)) return Promise.resolve(false);
    this.contas.push(conta);
    return Promise.resolve(true);
  }
}

// Dados FICTÍCIOS.
const conta = (email: string): ContaNova => ({
  tenantId: '0199a000-0000-7000-8000-0000000000a1' as Uuid,
  nomeDoTenant: 'Pessoa Fictícia',
  usuarioId: '0199a000-0000-7000-8000-0000000000b1' as Uuid,
  nome: 'Pessoa Fictícia',
  email,
  senhaHash: 'hash',
});

describe('CriarConta (HU11)', () => {
  it('prepara: e-mail normalizado e senha em hash; recusa e-mail ou senha inválidos', async () => {
    const criar = new CriarConta(hasher, new ContasEmMemoria());
    const pronta = await criar.preparar({
      nome: 'P',
      email: ' P@Exemplo.COM ',
      senha: 'uma frase longa de teste',
    });
    expect(pronta.ok && pronta.valor).toEqual({
      nome: 'P',
      email: 'p@exemplo.com',
      senhaHash: 'hash:24',
    });
    expect(
      (await criar.preparar({ nome: 'P', email: 'x', senha: 'uma frase longa de teste' })).ok,
    ).toBe(false);
    expect((await criar.preparar({ nome: 'P', email: 'p@exemplo.com', senha: 'curta' })).ok).toBe(
      false,
    );
  });

  it('grava; e-mail já usado vira conflito', async () => {
    const criar = new CriarConta(hasher, new ContasEmMemoria());
    expect((await criar.gravar({}, conta('p@exemplo.com'))).ok).toBe(true);
    const repetido = await criar.gravar({}, conta('p@exemplo.com'));
    expect(!repetido.ok && repetido.erro.codigo).toBe('email-em-uso');
  });
});
