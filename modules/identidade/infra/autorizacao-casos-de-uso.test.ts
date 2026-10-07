import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsultarPermissoes } from '../application/autorizacao.js';

import { PerfisEmMemoria } from './em-memoria.js';

import type { Sessao } from '../domain/sessao.js';

/** Os casos sem permissão desconhecida nunca avisam. */
const semAviso = (permissao: string): never => {
  throw new Error(`aviso inesperado: ${permissao}`);
};
const relogio = new FixedClock(Instant.deIso('2026-10-06T12:00:00Z'));
const sessao: Sessao = {
  id: gerarUuidV7(relogio),
  usuarioId: gerarUuidV7(relogio),
  tenantId: gerarUuidV7(relogio),
  nivel: 'completo',
  segundoFatorAtivo: true,
  criadaEm: relogio.agora(),
  ultimoUso: relogio.agora(),
};

describe('ConsultarPermissoes', () => {
  it('devolve as permissões dos perfis do usuário', async () => {
    const perfis = new PerfisEmMemoria();
    perfis.atribuir(sessao.usuarioId, 'colaborador');
    const permissoes = await new ConsultarPermissoes(perfis, semAviso).executar(sessao);
    expect([...permissoes].sort()).toEqual([
      'calendario:ler',
      'conta:gerir',
      'prazos:ler',
      'processos:ler',
      'publicacoes:ler',
    ]);
  });

  it('sessão sem 2FA não tem permissão alguma', async () => {
    const perfis = new PerfisEmMemoria();
    perfis.atribuir(sessao.usuarioId, 'advogado');
    const consultar = new ConsultarPermissoes(perfis, semAviso);
    expect((await consultar.executar({ ...sessao, nivel: 'senha' })).size).toBe(0);
  });

  it('permissão fora do catálogo é ignorada e avisada', async () => {
    const avisos: string[] = [];
    const consultar = new ConsultarPermissoes(
      { permissoesDoUsuario: () => Promise.resolve(['prazos:ler', 'prazos:apagar']) },
      (p) => avisos.push(p),
    );
    expect([...(await consultar.executar(sessao))]).toEqual(['prazos:ler']);
    expect(avisos).toEqual(['prazos:apagar']);
  });
});
