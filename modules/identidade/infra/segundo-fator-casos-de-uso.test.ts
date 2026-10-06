import { randomBytes } from 'node:crypto';

import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  AtivarSegundoFator,
  ConfigurarSegundoFator,
  VerificarSegundoFator,
} from '../application/segundo-fator.js';
import { ElevarSessao } from '../application/sessoes.js';

import { SegundoFatorEmMemoria, SessoesEmMemoria } from './em-memoria.js';
import { CifraAesGcm, SegredosTotp } from './segundo-fator.js';

import type { Sessao } from '../domain/sessao.js';

const relogio = new FixedClock(Instant.deIso('2026-10-06T12:00:00Z'));
const passo = () => Math.floor(relogio.agora().epochMs / 30_000);

function montar() {
  const repositorio = new SegundoFatorEmMemoria();
  const segredos = new SegredosTotp();
  const cifra = new CifraAesGcm(randomBytes(32).toString('base64'));
  const sessao: Sessao = {
    id: gerarUuidV7(),
    usuarioId: gerarUuidV7(),
    tenantId: gerarUuidV7(),
    nivel: 'senha',
    segundoFatorAtivo: false,
    criadaEm: relogio.agora(),
    ultimoUso: relogio.agora(),
  };
  repositorio.cadastrar(sessao.usuarioId, 'ana@exemplo.invalid');
  return {
    repositorio,
    segredos,
    sessao,
    configurar: new ConfigurarSegundoFator(repositorio, segredos, cifra),
    ativar: new AtivarSegundoFator(repositorio, segredos, cifra, relogio),
    verificar: new VerificarSegundoFator(repositorio, segredos, cifra, relogio),
  };
}

async function ativado() {
  const montado = montar();
  const configurado = await montado.configurar.executar(montado.sessao);
  if (!configurado.ok) throw new Error('configurar deveria passar');
  const { segredo } = configurado.valor;
  const ativacao = await montado.ativar.executar(
    montado.sessao,
    montado.segredos.codigo(segredo, passo()),
  );
  if (!ativacao.ok) throw new Error('ativar deveria passar');
  return { ...montado, segredo, codigos: ativacao.valor.codigosDeRecuperacao };
}

describe('configurar e ativar o 2FA', () => {
  it('o segredo fica cifrado e pendente; ativar exige um código válido e devolve 10 códigos de recuperação', async () => {
    const { configurar, ativar, repositorio, segredos, sessao } = montar();
    const configurado = await configurar.executar(sessao);
    if (!configurado.ok) throw new Error('configurar deveria passar');
    expect(configurado.valor.uri).toContain(`secret=${configurado.valor.segredo}`);
    const guardado = await repositorio.obter(sessao.usuarioId);
    expect(guardado?.segredoCifrado).toMatch(/^v1\./);
    expect(guardado?.segredoCifrado).not.toContain(configurado.valor.segredo);

    expect(await ativar.executar(sessao, '000000')).toMatchObject({
      ok: false,
      erro: { codigo: 'segundo-fator-invalido' },
    });
    expect(await ativar.executar(sessao, 'abc')).toMatchObject({ ok: false });
    const ativacao = await ativar.executar(
      sessao,
      segredos.codigo(configurado.valor.segredo, passo()),
    );
    expect(ativacao.ok && ativacao.valor.codigosDeRecuperacao).toHaveLength(10);
    expect((await repositorio.obter(sessao.usuarioId))?.ativo).toBe(true);
  });

  it('com o 2FA ativo, não reconfigura nem reativa; sem configurar, não ativa', async () => {
    const { configurar, ativar, sessao } = await ativado();
    expect(await configurar.executar(sessao)).toMatchObject({
      ok: false,
      erro: { codigo: 'segundo-fator-ja-ativo' },
    });
    expect(await ativar.executar(sessao, '123456')).toMatchObject({
      ok: false,
      erro: { codigo: 'segundo-fator-nao-pendente' },
    });
    const outro = montar();
    expect(await outro.ativar.executar(outro.sessao, '123456')).toMatchObject({ ok: false });
  });
});

describe('verificar o 2FA', () => {
  it('aceita o passo atual e os vizinhos (±30 s), nunca o mesmo código duas vezes', async () => {
    const { verificar, segredos, segredo, sessao } = await ativado();
    relogio.avancarMs(60_000);
    const anterior = segredos.codigo(segredo, passo() - 1);
    expect((await verificar.executar(sessao, anterior)).ok).toBe(true);
    expect((await verificar.executar(sessao, anterior)).ok).toBe(false); // reutilização
    expect((await verificar.executar(sessao, segredos.codigo(segredo, passo() - 2))).ok).toBe(
      false,
    ); // fora da janela
    expect((await verificar.executar(sessao, segredos.codigo(segredo, passo() + 1))).ok).toBe(true);
    expect((await verificar.executar(sessao, segredos.codigo(segredo, passo()))).ok).toBe(false); // passo já superado
  });

  it('código de recuperação vale uma vez, com ou sem hífen e em minúsculas', async () => {
    const { verificar, codigos, sessao } = await ativado();
    const [primeiro, segundo] = codigos;
    expect((await verificar.executar(sessao, String(primeiro))).ok).toBe(true);
    expect((await verificar.executar(sessao, String(primeiro))).ok).toBe(false);
    expect(
      (await verificar.executar(sessao, String(segundo).replace('-', '').toLowerCase())).ok,
    ).toBe(true);
    expect((await verificar.executar(sessao, 'AAAAA-BBBBB')).ok).toBe(false);
  });

  it('sem 2FA ativo, nenhuma verificação passa', async () => {
    const { verificar, sessao } = montar();
    expect((await verificar.executar(sessao, '123456')).ok).toBe(false);
  });
});

describe('elevar a sessão', () => {
  it('troca o token: o anterior deixa de valer e a nova sessão é completa', async () => {
    const sessoes = new SessoesEmMemoria();
    const { sessao } = montar();
    await sessoes.gravar('antigo', sessao);
    const elevada = await new ElevarSessao(sessoes, { novoToken: () => 'novo' }, relogio).executar(
      'antigo',
      sessao,
    );
    expect(elevada.sessao).toMatchObject({
      nivel: 'completo',
      segundoFatorAtivo: true,
      id: sessao.id,
    });
    expect(await sessoes.obter('antigo')).toBeUndefined();
    expect(await sessoes.obter('novo')).toEqual(elevada.sessao);
  });
});
