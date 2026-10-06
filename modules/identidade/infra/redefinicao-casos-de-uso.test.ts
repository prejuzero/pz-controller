import { randomBytes } from 'node:crypto';

import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { EnviarAvisosDeSeguranca } from '../application/avisos.js';
import { RedefinirSenha, SolicitarRedefinicaoDeSenha } from '../application/redefinicao.js';
import { Autenticar, ProtecaoDeAcesso, RegistrarCredencial } from '../application/sessoes.js';

import {
  AcessosEmMemoria,
  CredenciaisEmMemoria,
  PublicadorEmMemoria,
  RedefinicoesEmMemoria,
  SessoesEmMemoria,
  TentativasEmMemoria,
} from './em-memoria.js';
import { CifraAesGcm } from './segundo-fator.js';

import type { Email } from '../domain/credenciais.js';
import type { EmailCanonico, ProvedorEmail } from '@pz/integracoes';
import type { EventoDominio } from '@pz/kernel';

const relogio = new FixedClock(Instant.deIso('2026-10-06T12:00:00Z'));
const CTX = { ip: '203.0.113.7', userAgent: 'teste' };
const USUARIO = gerarUuidV7();
const TENANT = gerarUuidV7();

const hasher = {
  gerar: (senha: string) => Promise.resolve(`hash:${senha}`),
  verificar: (hash: string, senha: string) => Promise.resolve(hash === `hash:${senha}`),
};

function montar() {
  const credenciais = new CredenciaisEmMemoria();
  credenciais.cadastrar('ana@exemplo.invalid' as Email, {
    usuarioId: USUARIO,
    tenantId: TENANT,
    senhaHash: 'hash:senha antiga bem longa',
    segundoFatorAtivo: false,
  });
  const sessoes = new SessoesEmMemoria();
  const tentativas = new TentativasEmMemoria();
  const publicador = new PublicadorEmMemoria();
  const redefinicoes = new RedefinicoesEmMemoria();
  const cifra = new CifraAesGcm(randomBytes(32).toString('base64'));
  let n = 0;
  const tokens = { novoToken: () => `token-${String(++n)}` };
  let m = 0;
  const tokensDeRedefinicao = { novoToken: () => `reset-${String(++m)}` };
  const protecao = new ProtecaoDeAcesso(tentativas, new AcessosEmMemoria(), relogio, publicador);
  const noTenant = <R>(_tenant: string, trabalho: () => Promise<R>) => trabalho();
  return {
    publicador,
    cifra,
    sessoes,
    solicitar: new SolicitarRedefinicaoDeSenha(
      credenciais,
      redefinicoes,
      tokensDeRedefinicao,
      cifra,
      publicador,
      relogio,
    ),
    redefinir: new RedefinirSenha(
      redefinicoes,
      new RegistrarCredencial(credenciais, hasher, sessoes),
      tentativas,
      noTenant,
    ),
    autenticar: new Autenticar(credenciais, hasher, sessoes, tokens, relogio, protecao),
  };
}

describe('recuperação de senha (HU06)', () => {
  it('e-mail existente: publica o evento com o token cifrado; inexistente ou inválido: nada', async () => {
    const { solicitar, publicador, cifra } = montar();
    await solicitar.executar('ninguem@exemplo.invalid');
    await solicitar.executar('invalido');
    expect(publicador.publicados).toEqual([]);
    await solicitar.executar(' ANA@exemplo.invalid ');
    const [evento] = publicador.publicados as EventoDominio<
      string,
      { usuarioId: string; tokenCifrado: string }
    >[];
    expect(evento).toMatchObject({
      tipo: 'RedefinicaoDeSenhaSolicitada',
      versao: 1,
      tenantId: TENANT,
    });
    expect(evento?.payload.tokenCifrado).toMatch(/^v1\./);
    expect(cifra.decifrar(String(evento?.payload.tokenCifrado))).toBe('reset-1');
  });

  it('token vale uma vez, troca a senha, revoga sessões e desbloqueia o login; pedido novo invalida o anterior', async () => {
    const { solicitar, redefinir, autenticar, sessoes } = montar();
    for (let i = 0; i < 10; i++)
      await autenticar.executar({ email: 'ana@exemplo.invalid', senha: 'errada mas longa' }, CTX);
    await sessoes.gravar('sessao-antiga', {
      id: gerarUuidV7(),
      usuarioId: USUARIO,
      tenantId: TENANT,
      nivel: 'completo',
      segundoFatorAtivo: true,
      criadaEm: relogio.agora(),
      ultimoUso: relogio.agora(),
    });
    await solicitar.executar('ana@exemplo.invalid'); // reset-1
    await solicitar.executar('ana@exemplo.invalid'); // reset-2 invalida o 1
    expect(await redefinir.executar('reset-1', 'nova senha bem longa')).toMatchObject({
      ok: false,
      erro: { codigo: 'redefinicao-invalida' },
    });
    expect(await redefinir.executar('reset-2', 'curta')).toMatchObject({
      ok: false,
      erro: { categoria: 'validacao' },
    });
    expect((await redefinir.executar('reset-2', 'nova senha bem longa')).ok).toBe(true); // a política falhou antes, o token seguia válido
    expect((await redefinir.executar('reset-2', 'outra senha bem longa')).ok).toBe(false); // uso único
    expect(await sessoes.obter('sessao-antiga')).toBeUndefined();
    expect(
      (
        await autenticar.executar(
          { email: 'ana@exemplo.invalid', senha: 'nova senha bem longa' },
          CTX,
        )
      ).ok,
    ).toBe(true);
  });
});

describe('aviso de bloqueio (HU06)', () => {
  it('a 10ª falha publica ContaBloqueada com o fim do bloqueio', async () => {
    const { autenticar, publicador } = montar();
    for (let i = 0; i < 10; i++)
      await autenticar.executar({ email: 'ana@exemplo.invalid', senha: 'errada mas longa' }, CTX);
    expect(publicador.publicados).toEqual([
      expect.objectContaining({
        tipo: 'ContaBloqueada',
        payload: { usuarioId: USUARIO, motivo: 'login', bloqueadaAte: '2026-10-06T12:15:00.000Z' },
      }),
    ]);
  });
});

describe('e-mails de segurança', () => {
  const enviados: EmailCanonico[] = [];
  const provedor: ProvedorEmail = {
    enviar: (email) => {
      enviados.push(email);
      return Promise.resolve({ idExterno: 'x', aceitoEm: relogio.agora() });
    },
    saude: () => Promise.resolve({ estado: 'operacional', verificadoEm: relogio.agora() }),
  };
  const cifra = new CifraAesGcm(randomBytes(32).toString('base64'));
  const emails = {
    emailDe: (_tx: unknown, id: string) =>
      Promise.resolve(id === USUARIO ? 'ana@exemplo.invalid' : undefined),
  };
  const avisos = new EnviarAvisosDeSeguranca(
    provedor,
    emails,
    cifra,
    'https://app.prejuzero.com.br',
  );
  const base = { versao: 1, tenantId: TENANT, agregadoId: USUARIO, ocorridoEm: relogio.agora() };

  it('redefinição: link com o token no fragmento, idempotência pelo evento, sem dados de processo', async () => {
    const id = gerarUuidV7();
    await avisos.redefinicaoSolicitada(undefined, {
      ...base,
      id,
      tipo: 'RedefinicaoDeSenhaSolicitada',
      payload: { usuarioId: USUARIO, tokenCifrado: cifra.cifrar('tok<en>') },
    });
    const [email] = enviados;
    expect(email).toMatchObject({ idempotencia: id, para: ['ana@exemplo.invalid'] });
    expect(email?.texto).toContain('https://app.prejuzero.com.br/redefinir-senha#token=tok<en>');
    expect(email?.html).toContain('#token=tok&#60;en&#62;'); // escapado no HTML
  });

  it('bloqueio: avisa o titular; usuário inexistente não gera envio', async () => {
    enviados.length = 0;
    await avisos.contaBloqueada(undefined, {
      ...base,
      id: gerarUuidV7(),
      tipo: 'ContaBloqueada',
      payload: {
        usuarioId: USUARIO,
        motivo: 'segundo-fator',
        bloqueadaAte: '2026-10-06T12:15:00.000Z',
      },
    });
    expect(enviados[0]?.texto).toContain('código de verificação (2FA)');
    await avisos.contaBloqueada(undefined, {
      ...base,
      id: gerarUuidV7(),
      tipo: 'ContaBloqueada',
      payload: {
        usuarioId: gerarUuidV7(),
        motivo: 'login',
        bloqueadaAte: '2026-10-06T12:15:00.000Z',
      },
    });
    await avisos.redefinicaoSolicitada(undefined, {
      ...base,
      id: gerarUuidV7(),
      tipo: 'RedefinicaoDeSenhaSolicitada',
      payload: { usuarioId: gerarUuidV7(), tokenCifrado: 'x' },
    });
    expect(enviados).toHaveLength(1);
  });
});
