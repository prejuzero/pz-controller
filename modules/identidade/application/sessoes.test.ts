import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { Autenticar, EncerrarSessao, RegistrarCredencial, ValidarSessao } from './sessoes.js';

import type {
  ArmazemDeSessoes,
  CredencialArmazenada,
  HasherDeSenha,
  RepositorioDeCredenciais,
} from './portas.js';
import type { Email } from '../domain/credenciais.js';
import type { Sessao } from '../domain/sessao.js';
import type { Uuid } from '@pz/kernel';

const H = 3600 * 1000;
const relogio = new FixedClock(Instant.deIso('2026-10-06T12:00:00Z'));
const USUARIO = gerarUuidV7(relogio);
const TENANT = gerarUuidV7(relogio);

class Credenciais implements RepositorioDeCredenciais {
  readonly porEmail = new Map<string, CredencialArmazenada>();
  consultas: string[] = [];
  localizarPorEmail(email: Email) {
    this.consultas.push(email);
    return Promise.resolve(this.porEmail.get(email));
  }
  definirSenha(usuarioId: Uuid, senhaHash: string) {
    for (const [email, c] of this.porEmail)
      if (c.usuarioId === usuarioId) this.porEmail.set(email, { ...c, senhaHash });
    return Promise.resolve();
  }
}

/** Hash de mentira, mas que registra quantas verificações aconteceram (tempo constante). */
class Hasher implements HasherDeSenha {
  verificacoes = 0;
  gerar(senha: string) {
    return Promise.resolve(`hash:${senha}`);
  }
  verificar(hash: string, senha: string) {
    this.verificacoes += 1;
    return Promise.resolve(hash === `hash:${senha}`);
  }
}

class Sessoes implements ArmazemDeSessoes {
  readonly mapa = new Map<string, Sessao>();
  gravar(token: string, sessao: Sessao) {
    this.mapa.set(token, sessao);
    return Promise.resolve();
  }
  obter(token: string) {
    return Promise.resolve(this.mapa.get(token));
  }
  remover(token: string) {
    this.mapa.delete(token);
    return Promise.resolve();
  }
  removerTodasDoUsuario(usuarioId: Uuid) {
    for (const [t, s] of this.mapa) if (s.usuarioId === usuarioId) this.mapa.delete(t);
    return Promise.resolve();
  }
}

function montar() {
  const credenciais = new Credenciais();
  credenciais.porEmail.set('advogada@exemplo.com', {
    usuarioId: USUARIO,
    tenantId: TENANT,
    senhaHash: 'hash:senha correta longa',
  });
  const hasher = new Hasher();
  const sessoes = new Sessoes();
  let contador = 0;
  const tokens = { novoToken: () => `token-${String(++contador)}` };
  return {
    credenciais,
    hasher,
    sessoes,
    autenticar: new Autenticar(credenciais, hasher, sessoes, tokens, relogio),
    validar: new ValidarSessao(sessoes, relogio),
  };
}

describe('autenticar', () => {
  it('senha certa cria sessão opaca no nível "senha", no tenant do usuário', async () => {
    const { autenticar, sessoes } = montar();
    const resultado = await autenticar.executar({
      email: ' Advogada@Exemplo.com',
      senha: 'senha correta longa',
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valor.sessao).toMatchObject({
      usuarioId: USUARIO,
      tenantId: TENANT,
      nivel: 'senha',
    });
    expect(sessoes.mapa.get(resultado.valor.token)).toEqual(resultado.valor.sessao);
  });

  it('e-mail inexistente, senha errada, sem senha ou e-mail inválido: mesma resposta e sempre verifica um hash', async () => {
    const { autenticar, credenciais, hasher, sessoes } = montar();
    credenciais.porEmail.set('sem-senha@exemplo.com', {
      usuarioId: gerarUuidV7(),
      tenantId: TENANT,
      senhaHash: null,
    });
    const tentativas = [
      { email: 'ninguem@exemplo.com', senha: 'qualquer senha longa' },
      { email: 'advogada@exemplo.com', senha: 'senha errada longa' },
      { email: 'sem-senha@exemplo.com', senha: 'qualquer senha longa' },
      { email: 'invalido', senha: 'qualquer senha longa' },
    ];
    for (const tentativa of tentativas) {
      const resultado = await autenticar.executar(tentativa);
      expect(resultado).toMatchObject({
        ok: false,
        erro: { codigo: 'credenciais-invalidas', categoria: 'nao-autenticado' },
      });
    }
    expect(hasher.verificacoes).toBe(tentativas.length);
    expect(sessoes.mapa.size).toBe(0);
  });
});

describe('validar e encerrar sessão', () => {
  it('renova a inatividade a cada uso e recusa depois de expirada', async () => {
    const { autenticar, validar, sessoes } = montar();
    const criada = await autenticar.executar({
      email: 'advogada@exemplo.com',
      senha: 'senha correta longa',
    });
    if (!criada.ok) throw new Error('login deveria passar');
    const { token } = criada.valor;

    relogio.avancarMs(11 * H);
    expect((await validar.executar(token)).ok).toBe(true);
    relogio.avancarMs(11 * H); // 22 h desde o login, 11 h desde o último uso
    expect((await validar.executar(token)).ok).toBe(true);
    relogio.avancarMs(12 * H);
    expect(await validar.executar(token)).toMatchObject({
      ok: false,
      erro: { codigo: 'sessao-invalida' },
    });
    expect(sessoes.mapa.has(token)).toBe(false);
    expect((await validar.executar('inexistente')).ok).toBe(false);
  });

  it('encerrar remove só aquela sessão', async () => {
    const { autenticar, validar, sessoes } = montar();
    const a = await autenticar.executar({
      email: 'advogada@exemplo.com',
      senha: 'senha correta longa',
    });
    const b = await autenticar.executar({
      email: 'advogada@exemplo.com',
      senha: 'senha correta longa',
    });
    if (!a.ok || !b.ok) throw new Error('login deveria passar');
    await new EncerrarSessao(sessoes).executar(a.valor.token);
    expect((await validar.executar(a.valor.token)).ok).toBe(false);
    expect((await validar.executar(b.valor.token)).ok).toBe(true);
  });
});

describe('registrar credencial', () => {
  it('valida a política, grava o hash e revoga todas as sessões do usuário', async () => {
    const { autenticar, credenciais, hasher, sessoes } = montar();
    await autenticar.executar({ email: 'advogada@exemplo.com', senha: 'senha correta longa' });
    const registrar = new RegistrarCredencial(credenciais, hasher, sessoes);
    expect((await registrar.executar(USUARIO, 'curta')).ok).toBe(false);
    expect((await registrar.executar(USUARIO, 'nova senha bem longa')).ok).toBe(true);
    expect(sessoes.mapa.size).toBe(0);
    expect(
      (await autenticar.executar({ email: 'advogada@exemplo.com', senha: 'nova senha bem longa' }))
        .ok,
    ).toBe(true);
  });
});
