import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { CuradoriaDasRegras, situacoes } from '../application/curadoria-das-regras.js';

import type {
  RepositorioDaCuradoriaDeRegras,
  VersaoDaRegra,
} from '../application/curadoria-das-regras.js';
import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Regras e curadoras FICTÍCIAS.
const relogio = new FixedClock(Instant.deIso('2026-11-11T12:00:00Z'));
const ANA = gerarUuidV7();
const BIA = gerarUuidV7();

class RegrasFalsas implements RepositorioDaCuradoriaDeRegras<TransacaoEmMemoria> {
  regras: VersaoDaRegra[] = [];
  listar() {
    return Promise.resolve([...this.regras]);
  }
  versao(_tx: TransacaoEmMemoria, codigo: string, versao: number) {
    return Promise.resolve(this.regras.find((r) => r.codigo === codigo && r.versao === versao));
  }
  proximaVersao(_tx: TransacaoEmMemoria, codigo: string) {
    return Promise.resolve(
      Math.max(0, ...this.regras.filter((r) => r.codigo === codigo).map((r) => r.versao)) + 1,
    );
  }
  tipoAtoExiste(_tx: TransacaoEmMemoria, tipoAto: string) {
    return Promise.resolve(tipoAto === 'contestacao');
  }
  inserir(_tx: TransacaoEmMemoria, r: VersaoDaRegra) {
    this.regras.push(r);
    return Promise.resolve();
  }
  ativar(_tx: TransacaoEmMemoria, codigo: string, versao: number, por: Uuid, em: Instant) {
    this.regras = this.regras.map((r) =>
      r.codigo === codigo && r.versao === versao
        ? { ...r, ativa: true, ativadaPor: por, ativadaEm: em }
        : r,
    );
    return Promise.resolve();
  }
  retirar(_tx: TransacaoEmMemoria, codigo: string, em: Instant) {
    const n = this.regras.filter((r) => r.codigo === codigo && r.ativa).length;
    this.regras = this.regras.map((r) =>
      r.codigo === codigo && r.ativa ? { ...r, ativa: false, retiradaEm: em } : r,
    );
    return Promise.resolve(n);
  }
}

function montar() {
  const repo = new RegrasFalsas();
  const tipos: string[] = [];
  const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
    registrar: (tx, e: EntradaDeAuditoria) => {
      tx.aoConfirmar(() => tipos.push(e.tipo));
      return Promise.resolve();
    },
  };
  return {
    repo,
    tipos,
    curadoria: new CuradoriaDasRegras(new OutboxEmMemoria(), repo, trilha, relogio),
  };
}
const ana = { usuarioId: ANA, canal: 'portal' as const };
const bia = { usuarioId: BIA, canal: 'portal' as const };
const proposta = {
  codigo: 'contestacao-intime',
  tipoAto: 'contestacao',
  padroes: ['\\bcontestacao\\b'],
  confianca: 0.95,
};

describe('curadoria das regras rápidas (PZ-313)', () => {
  it('propõe inativa, a curadoria ativa (inclusive a própria), nova versão substitui e retirar desliga', async () => {
    const { repo, tipos, curadoria } = montar();
    const v1 = await curadoria.propor(ana, proposta);
    expect(v1).toMatchObject({ ok: true, valor: { versao: 1, ativa: false, propostaPor: ANA } });
    expect((await curadoria.ativar(ana, proposta.codigo, 1)).ok).toBe(true);
    expect(await curadoria.ativar(bia, proposta.codigo, 1)).toMatchObject({
      ok: false,
      erro: { codigo: 'regra-ja-decidida' },
    });
    await curadoria.propor(bia, { ...proposta, confianca: 0.9 });
    await curadoria.ativar(ana, proposta.codigo, 2);
    expect([...situacoes(await curadoria.listar()).entries()]).toEqual([
      ['contestacao-intime@1', 'substituida'],
      ['contestacao-intime@2', 'ativa'],
    ]);
    expect((await curadoria.retirar(ana, proposta.codigo)).ok).toBe(true);
    expect(repo.regras.every((r) => !r.ativa)).toBe(true);
    expect([...situacoes(repo.regras).values()]).toEqual(['retirada', 'retirada']);
    expect(tipos).toEqual([
      'classificacao.regra-proposta',
      'classificacao.regra-ativada',
      'classificacao.regra-proposta',
      'classificacao.regra-ativada',
      'classificacao.regra-retirada',
    ]);
  });

  it('recusa padrão inseguro, ato fora da taxonomia, versão inexistente e retirada sem ativa', async () => {
    const { curadoria } = montar();
    expect(await curadoria.propor(ana, { ...proposta, padroes: ['(a+)+'] })).toMatchObject({
      ok: false,
      erro: { problemas: [{ campo: 'padroes.0' }] },
    });
    expect(await curadoria.propor(ana, { ...proposta, tipoAto: 'outro' })).toMatchObject({
      ok: false,
      erro: { problemas: [{ campo: 'tipoAto' }] },
    });
    expect((await curadoria.ativar(bia, 'nao-existe', 1)).ok).toBe(false);
    expect((await curadoria.retirar(ana, 'nao-existe')).ok).toBe(false);
    await curadoria.propor(ana, proposta);
    expect([...situacoes(await curadoria.listar()).values()]).toEqual(['proposta']);
  });
});
