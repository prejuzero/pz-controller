import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  Autenticar,
  EncerrarSessao,
  ProtecaoDeAcesso,
  RegistrarCredencial,
  ValidarSessao,
} from './sessoes.js';

import type {
  Acesso,
  ControleDeTentativas,
  RegistroDeAcessos,
  ArmazemDeSessoes,
  CredencialArmazenada,
  HasherDeSenha,
  RepositorioDeCredenciais,
} from './portas.js';
import type { Email } from '../domain/credenciais.js';
import type { Sessao } from '../domain/sessao.js';
import type { Uuid } from '@pz/kernel';

const H = 3600 * 1000;
const CTX = { ip: '203.0.113.7', userAgent: 'teste' };

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

class TentativasEmMemoria implements ControleDeTentativas {
  readonly falhas = new Map<string, number>();
  readonly bloqueios = new Map<string, Instant>();
  bloqueadoAte(chave: string) {
    return Promise.resolve(this.bloqueios.get(chave));
  }
  registrarFalha(chave: string) {
    this.falhas.set(chave, (this.falhas.get(chave) ?? 0) + 1);
    return Promise.resolve(this.falhas.get(chave) ?? 0);
  }
  bloquear(chave: string, ate: Instant) {
    this.bloqueios.set(chave, ate);
    return Promise.resolve();
  }
  limpar(chave: string) {
    this.falhas.delete(chave);
    this.bloqueios.delete(chave);
    return Promise.resolve();
  }
}

class AcessosEmMemoria implements RegistroDeAcessos {
  readonly registrados: Acesso[] = [];
  registrar(acesso: Acesso) {
    this.registrados.push(acesso);
    return Promise.resolve();
  }
  ultimos() {
    return Promise.resolve([...this.registrados].reverse());
  }
}

function montar() {
  const credenciais = new Credenciais();
  credenciais.porEmail.set('advogada@exemplo.com', {
    usuarioId: USUARIO,
    tenantId: TENANT,
    senhaHash: 'hash:senha correta longa',
    segundoFatorAtivo: false,
  });
  const hasher = new Hasher();
  const sessoes = new Sessoes();
  let contador = 0;
  const tokens = { novoToken: () => `token-${String(++contador)}` };
  const acessos = new AcessosEmMemoria();
  const protecao = new ProtecaoDeAcesso(new TentativasEmMemoria(), acessos, relogio);
  return {
    credenciais,
    hasher,
    sessoes,
    acessos,
    protecao,
    autenticar: new Autenticar(credenciais, hasher, sessoes, tokens, relogio, protecao),
    validar: new ValidarSessao(sessoes, relogio),
  };
}

describe('autenticar', () => {
  it('senha certa cria sessão opaca no nível "senha", no tenant do usuário', async () => {
    const { autenticar, sessoes } = montar();
    const resultado = await autenticar.executar(
      {
        email: ' Advogada@Exemplo.com',
        senha: 'senha correta longa',
      },
      CTX,
    );
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
      segundoFatorAtivo: false,
    });
    const tentativas = [
      { email: 'ninguem@exemplo.com', senha: 'qualquer senha longa' },
      { email: 'advogada@exemplo.com', senha: 'senha errada longa' },
      { email: 'sem-senha@exemplo.com', senha: 'qualquer senha longa' },
      { email: 'invalido', senha: 'qualquer senha longa' },
    ];
    for (const tentativa of tentativas) {
      const resultado = await autenticar.executar(tentativa, CTX);
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
    const criada = await autenticar.executar(
      {
        email: 'advogada@exemplo.com',
        senha: 'senha correta longa',
      },
      CTX,
    );
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
    const { autenticar, validar, sessoes, protecao } = montar();
    const a = await autenticar.executar(
      {
        email: 'advogada@exemplo.com',
        senha: 'senha correta longa',
      },
      CTX,
    );
    const b = await autenticar.executar(
      {
        email: 'advogada@exemplo.com',
        senha: 'senha correta longa',
      },
      CTX,
    );
    if (!a.ok || !b.ok) throw new Error('login deveria passar');
    await new EncerrarSessao(sessoes, protecao).executar(a.valor.token, a.valor.sessao, CTX);
    expect((await validar.executar(a.valor.token)).ok).toBe(false);
    expect((await validar.executar(b.valor.token)).ok).toBe(true);
  });
});

describe('registrar credencial', () => {
  it('valida a política, grava o hash e revoga todas as sessões do usuário', async () => {
    const { autenticar, credenciais, hasher, sessoes } = montar();
    await autenticar.executar({ email: 'advogada@exemplo.com', senha: 'senha correta longa' }, CTX);
    const registrar = new RegistrarCredencial(credenciais, hasher, sessoes);
    expect((await registrar.executar(USUARIO, 'curta')).ok).toBe(false);
    expect((await registrar.executar(USUARIO, 'nova senha bem longa')).ok).toBe(true);
    expect(sessoes.mapa.size).toBe(0);
    expect(
      (
        await autenticar.executar(
          { email: 'advogada@exemplo.com', senha: 'nova senha bem longa' },
          CTX,
        )
      ).ok,
    ).toBe(true);
  });
});

describe('proteção contra força bruta no login', () => {
  it('10 falhas bloqueiam a conta: nem a senha certa entra; o bloqueio vence e o sucesso zera', async () => {
    const { autenticar, acessos } = montar();
    const errada = { email: 'advogada@exemplo.com', senha: 'senha errada longa' };
    const certa = { email: 'advogada@exemplo.com', senha: 'senha correta longa' };
    for (let i = 0; i < 10; i++) expect((await autenticar.executar(errada, CTX)).ok).toBe(false);
    const bloqueada = await autenticar.executar(certa, CTX);
    expect(bloqueada).toMatchObject({ ok: false, erro: { codigo: 'credenciais-invalidas' } }); // mesma resposta
    expect(acessos.registrados.filter((a) => a.tipo === 'bloqueio')).toHaveLength(1);
    expect(acessos.registrados.at(-1)).toMatchObject({ tipo: 'login', sucesso: false, ip: CTX.ip });

    relogio.avancarMs(15 * 60_000);
    expect((await autenticar.executar(certa, CTX)).ok).toBe(true);
    expect(acessos.registrados.at(-1)).toMatchObject({
      tipo: 'login',
      sucesso: true,
      usuarioId: USUARIO,
    });
    for (let i = 0; i < 9; i++) await autenticar.executar(errada, CTX);
    expect((await autenticar.executar(certa, CTX)).ok).toBe(true); // contador zerado no sucesso
  });

  it('e-mail inexistente também conta falhas (sem registrar acesso de usuário)', async () => {
    const { autenticar, acessos } = montar();
    for (let i = 0; i < 12; i++)
      await autenticar.executar({ email: 'ninguem@exemplo.com', senha: 'x'.repeat(12) }, CTX);
    expect(acessos.registrados).toEqual([]);
  });

  it('logout fica registrado', async () => {
    const { autenticar, sessoes, protecao, acessos } = montar();
    const login = await autenticar.executar(
      { email: 'advogada@exemplo.com', senha: 'senha correta longa' },
      CTX,
    );
    if (!login.ok) throw new Error('login deveria passar');
    await new EncerrarSessao(sessoes, protecao).executar(
      login.valor.token,
      login.valor.sessao,
      CTX,
    );
    expect(acessos.registrados.at(-1)).toMatchObject({ tipo: 'logout', sucesso: true });
  });
});
