import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  ListarDispositivos,
  RegistrarDispositivo,
  RenovarTokens,
  RevogarDispositivo,
} from '../application/dispositivos.js';
import { ValidarSessao } from '../application/sessoes.js';

import {
  DispositivosEmMemoria,
  PublicadorEmMemoria,
  RenovacoesEmMemoria,
  SessoesEmMemoria,
} from './em-memoria.js';

import type { Sessao } from '../domain/sessao.js';

const relogio = new FixedClock(Instant.deIso('2026-10-06T12:00:00Z'));

function montar() {
  const dispositivos = new DispositivosEmMemoria();
  const sessoes = new SessoesEmMemoria();
  const renovacoes = new RenovacoesEmMemoria();
  const publicador = new PublicadorEmMemoria();
  let n = 0;
  const tokens = { novoToken: () => `t${String(++n).padStart(3, '0')}` };
  const noTenant = <R>(_t: string, trabalho: () => Promise<R>) => trabalho();
  const sessao: Sessao = {
    id: gerarUuidV7(),
    usuarioId: gerarUuidV7(),
    tenantId: gerarUuidV7(),
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: relogio.agora(),
    ultimoUso: relogio.agora(),
  };
  return {
    sessao,
    dispositivos,
    sessoes,
    publicador,
    validar: new ValidarSessao(sessoes, relogio),
    registrar: new RegistrarDispositivo(
      dispositivos,
      sessoes,
      renovacoes,
      tokens,
      publicador,
      relogio,
    ),
    renovar: new RenovarTokens(
      dispositivos,
      sessoes,
      renovacoes,
      tokens,
      publicador,
      relogio,
      noTenant,
    ),
    revogar: new RevogarDispositivo(dispositivos, sessoes, renovacoes, publicador, relogio),
    listar: new ListarDispositivos(dispositivos),
  };
}

describe('sessões por dispositivo (HU06)', () => {
  it('registra o dispositivo, emite acesso de 15 min e renovação de 30 dias, publica o evento', async () => {
    const { registrar, validar, sessao, publicador, listar } = montar();
    const tokens = await registrar.executar(sessao, {
      tipoCliente: 'mobile',
      nome: '  iPhone da Ana  ',
    });
    expect(tokens.acessoExpiraEm).toEqual(relogio.agora().maisMs(15 * 60_000));
    expect(tokens.renovacaoExpiraEm).toEqual(relogio.agora().maisMs(30 * 24 * 3600 * 1000));
    expect((await validar.executar(tokens.tokenDeAcesso)).ok).toBe(true);
    expect(publicador.publicados[0]).toMatchObject({
      tipo: 'DispositivoRegistrado',
      payload: { tipoCliente: 'mobile' },
    });
    expect(await listar.executar(sessao)).toEqual([
      expect.objectContaining({ nome: 'iPhone da Ana', tipoCliente: 'mobile' }),
    ]);
    relogio.avancarMs(15 * 60_000);
    expect((await validar.executar(tokens.tokenDeAcesso)).ok).toBe(false); // acesso curto venceu
  });

  it('renovar troca o par; o token de renovação vale uma vez e o reuso revoga o dispositivo', async () => {
    const { registrar, renovar, validar, sessao, dispositivos, publicador } = montar();
    const primeiro = await registrar.executar(sessao, { tipoCliente: 'mcp', nome: 'Claude' });
    const segundo = await renovar.executar(primeiro.tokenDeRenovacao);
    if (!segundo.ok) throw new Error('renovar deveria passar');
    expect((await validar.executar(segundo.valor.tokenDeAcesso)).ok).toBe(true);

    // Reuso do token já trocado: possível roubo → tudo do dispositivo cai.
    expect(await renovar.executar(primeiro.tokenDeRenovacao)).toMatchObject({
      ok: false,
      erro: { codigo: 'renovacao-invalida' },
    });
    expect((await validar.executar(segundo.valor.tokenDeAcesso)).ok).toBe(false);
    expect((await renovar.executar(segundo.valor.tokenDeRenovacao)).ok).toBe(false);
    expect(await dispositivos.ativo(primeiro.dispositivoId, sessao.usuarioId)).toBe(false);
    expect(publicador.publicados.at(-1)).toMatchObject({
      tipo: 'SessaoRevogada',
      payload: { motivo: 'reuso-de-renovacao' },
    });
    expect((await renovar.executar('desconhecido')).ok).toBe(false);
  });

  it('revogação remota derruba acesso e renovação; dispositivo de outro usuário não é tocado', async () => {
    const { registrar, revogar, renovar, validar, sessao, publicador } = montar();
    const tokens = await registrar.executar(sessao, { tipoCliente: 'integrador', nome: 'ERP' });
    const intruso = { ...sessao, usuarioId: gerarUuidV7() };
    expect(await revogar.executar(intruso, tokens.dispositivoId)).toMatchObject({
      ok: false,
      erro: { categoria: 'nao-encontrado' },
    });
    expect((await validar.executar(tokens.tokenDeAcesso)).ok).toBe(true); // nada foi apagado

    expect((await revogar.executar(sessao, tokens.dispositivoId)).ok).toBe(true);
    expect((await validar.executar(tokens.tokenDeAcesso)).ok).toBe(false);
    expect((await renovar.executar(tokens.tokenDeRenovacao)).ok).toBe(false);
    expect(publicador.publicados.at(-1)).toMatchObject({
      tipo: 'SessaoRevogada',
      payload: { motivo: 'usuario' },
    });
    expect((await revogar.executar(sessao, tokens.dispositivoId)).ok).toBe(false); // já revogado
  });
});
