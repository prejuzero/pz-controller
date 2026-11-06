import { createHash } from 'node:crypto';

import { OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { calcularHash, HASH_GENESE } from '../domain/cadeia.js';

import {
  ConsultarHistorico,
  EmitirHistoricoVerificavel,
  podeVerHistoricoDoPrazo,
  VerificarHistorico,
} from './historico.js';

import type { RepositorioDoHistorico, Verificacao } from './historico.js';
import type { RegistroEncadeado } from '../domain/cadeia.js';

// Trilha FICTÍCIA de um prazo (HU35).
const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');
const TENANT = '01a10e00-0000-7000-8000-0000000f0101';
const PRAZO = '01a10e00-0000-7000-8000-0000000f0102';
const NOTIFICACAO = '01a10e00-0000-7000-8000-0000000f0103';

function cadeia(): RegistroEncadeado[] {
  const tipos: [string, string, string][] = [
    ['prazos.prazo-sugerido', 'prazo', PRAZO],
    ['identidade.sessao-criada', 'sessao_dispositivo', 'outro'],
    ['prazos.prazo-confirmado', 'prazo', PRAZO],
    ['notificacoes.notificacao-rejeitada', 'notificacao', NOTIFICACAO],
  ];
  let anterior = HASH_GENESE;
  return tipos.map(([tipo, entidade, entidadeId], i) => {
    const registro = {
      id: `id-${String(i)}`,
      tenantId: TENANT,
      sequencia: i + 1,
      tipo,
      entidade,
      entidadeId,
      usuarioId: 'u',
      usuarioRealId: null,
      canal: 'portal',
      ip: '203.0.113.1',
      userAgent: 'Navegador',
      antes: null,
      depois: { estado: tipo },
      criadoEm: `2026-11-03T12:0${String(i)}:00.000Z`,
    };
    const hash = calcularHash(anterior, registro, sha256);
    const encadeado = { ...registro, hashAnterior: anterior, hash };
    anterior = hash;
    return encadeado;
  });
}

function repositorio(registros: RegistroEncadeado[]) {
  const emitidas = new Map<string, Verificacao & { emitidaEm: string }>();
  const repo: RepositorioDoHistorico<unknown> = {
    porEntidades: (_tx, _t, alvos) =>
      Promise.resolve(
        registros.filter((r) =>
          alvos.some((a) => a.entidade === r.entidade && a.entidadeId === r.entidadeId),
        ),
      ),
    porSequencias: (_tx, _t, seqs) =>
      Promise.resolve(registros.filter((r) => seqs.includes(r.sequencia))),
    gravarVerificacao: (_tx, v) => {
      if (!emitidas.has(v.codigo))
        emitidas.set(v.codigo, { ...v, emitidaEm: '2026-11-03T13:00:00.000Z' });
      return Promise.resolve();
    },
    verificacao: (_tx, codigo) => Promise.resolve(emitidas.get(codigo)),
  };
  return { repo, emitidas };
}

const PRINCIPAL = { entidade: 'prazo', entidadeId: PRAZO };
const alvos = [PRINCIPAL, { entidade: 'notificacao', entidadeId: NOTIFICACAO }];
const unidade = new OutboxEmMemoria();
const noTenant = <T>(_t: string, f: () => Promise<T>) => f();

describe('histórico do prazo (HU35)', () => {
  it('só os eventos do prazo e das notificações dele, sem IP nem agente', async () => {
    const { repo } = repositorio(cadeia());
    const eventos = await new ConsultarHistorico(unidade, repo).executar(TENANT, alvos);
    expect(eventos.map((e) => e.tipo)).toEqual([
      'prazos.prazo-sugerido',
      'prazos.prazo-confirmado',
      'notificacoes.notificacao-rejeitada',
    ]);
    expect(eventos[0]).not.toHaveProperty('ip');
    expect(eventos[0]).not.toHaveProperty('userAgent');
  });

  it('emite, verifica; adulterar o registro ou trocar o código falha', async () => {
    const registros = cadeia();
    const { repo, emitidas } = repositorio(registros);
    const emitir = new EmitirHistoricoVerificavel(unidade, repo, sha256);
    const { codigo, eventos } = await emitir.executar(TENANT, PRINCIPAL, alvos);
    expect(eventos).toHaveLength(3);
    // Mesmo trecho, mesmo código: emitir de novo não duplica.
    expect((await emitir.executar(TENANT, PRINCIPAL, alvos)).codigo).toBe(codigo);
    expect(emitidas.size).toBe(1);

    const verificar = new VerificarHistorico(noTenant, unidade, repo, sha256);
    const ok = await verificar.executar(codigo);
    expect(ok).toMatchObject({ situacao: 'valido', emitidaEm: '2026-11-03T13:00:00.000Z' });
    expect(ok.situacao === 'valido' && ok.eventos.map((e) => e.sequencia)).toEqual([1, 3, 4]);
    expect(ok.situacao === 'valido' && ok.eventos[0]).not.toHaveProperty('depois');

    expect(await verificar.executar(`${TENANT}.${'0'.repeat(64)}`)).toEqual({
      situacao: 'inexistente',
    });
    expect(await verificar.executar('lixo')).toEqual({ situacao: 'inexistente' });

    // Alguém altera o conteúdo direto no banco: o hash recalculado não confere.
    const alvo = registros[2];
    if (alvo === undefined) throw new Error('sem registro');
    registros[2] = { ...alvo, depois: { estado: 'adulterado' } };
    expect(await verificar.executar(codigo)).toEqual({
      situacao: 'divergente',
      motivo: 'registro 3 alterado (hash não confere)',
    });

    // Altera conteúdo e hash juntos: o código deixa de conferir.
    const { hash: hashOriginal, hashAnterior, ...sem } = registros[2];
    registros[2] = { ...registros[2], hash: calcularHash(hashAnterior, sem, sha256) };
    expect(registros[2].hash).not.toBe(hashOriginal);
    expect(await verificar.executar(codigo)).toEqual({
      situacao: 'divergente',
      motivo: 'código não confere com a trilha',
    });

    // Registro apagado.
    registros.splice(3, 1);
    expect(await verificar.executar(codigo)).toEqual({
      situacao: 'divergente',
      motivo: 'registro ausente na trilha',
    });
  });
});

describe('escopo do histórico do prazo (HU41, RF88)', () => {
  it('administrador vê todos; os demais, só os seus; sem responsável, só o administrador', () => {
    const admin = { usuarioId: 'a', veTodos: true };
    const ana = { usuarioId: 'ana', veTodos: false };
    expect(podeVerHistoricoDoPrazo(admin, 'outro')).toBe(true);
    expect(podeVerHistoricoDoPrazo(admin, null)).toBe(true);
    expect(podeVerHistoricoDoPrazo(ana, 'ana')).toBe(true);
    expect(podeVerHistoricoDoPrazo(ana, 'outro')).toBe(false);
    expect(podeVerHistoricoDoPrazo(ana, null)).toBe(false);
  });
});
