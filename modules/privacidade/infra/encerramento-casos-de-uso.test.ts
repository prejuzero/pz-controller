import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CancelarEncerramento,
  ConsultarEncerramento,
  EfetivarEncerramentos,
  SolicitarEncerramento,
} from '../application/encerramento.js';

import type { OperacoesDeEncerramento, RepositorioDeEncerramentos } from '../application/portas.js';
import type { Encerramento } from '../domain/encerramento.js';
import type { ArmazenamentoArquivos } from '@pz/integracoes';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS.
const TENANT = gerarUuidV7();
const USUARIO = gerarUuidV7();
const responsavel = {
  tenantId: TENANT,
  usuarioId: USUARIO,
  canal: 'portal' as const,
  podeEncerrar: true,
};
const relogio = (iso: string) => new FixedClock(Instant.deIso(iso));

class Repositorio implements RepositorioDeEncerramentos<TransacaoEmMemoria> {
  readonly itens = new Map<string, Encerramento>();
  buscar(_tx: TransacaoEmMemoria, tenantId: Uuid) {
    return Promise.resolve(this.itens.get(tenantId));
  }
  salvarPedido(_tx: TransacaoEmMemoria, tenantId: Uuid, e: Encerramento) {
    this.itens.set(tenantId, e);
    return Promise.resolve();
  }
  cancelar(_tx: TransacaoEmMemoria, tenantId: Uuid, em: Instant) {
    const atual = this.itens.get(tenantId);
    if (atual !== undefined) this.itens.set(tenantId, { ...atual, canceladoEm: em });
    return Promise.resolve();
  }
}

let unidade: OutboxEmMemoria;
let repo: Repositorio;
let auditados: string[];
const trilha = {
  registrar: (_tx: TransacaoEmMemoria, entrada: { tipo: string }) => {
    auditados.push(entrada.tipo);
    return Promise.resolve();
  },
};

beforeEach(() => {
  unidade = new OutboxEmMemoria();
  repo = new Repositorio();
  auditados = [];
});

describe('encerramento da conta (HU38)', () => {
  it('pedido com carência, repetido sem duplicar, consultado e cancelado dentro da carência', async () => {
    const agora = relogio('2026-10-07T12:00:00Z');
    const solicitar = new SolicitarEncerramento(unidade, repo, trilha, agora);
    const r = await solicitar.executar(responsavel);
    expect(r.ok && r.valor).toEqual({
      situacao: 'em-carencia',
      solicitadoEm: '2026-10-07T12:00:00.000Z',
      efetivarEm: '2026-11-06T12:00:00.000Z',
    });
    await solicitar.executar(responsavel);
    expect(auditados).toEqual(['privacidade.encerramento-solicitado']);
    expect((await new ConsultarEncerramento(unidade, repo, agora).executar(TENANT)).situacao).toBe(
      'em-carencia',
    );

    const cancelar = new CancelarEncerramento(unidade, repo, trilha, agora);
    expect((await cancelar.executar(responsavel)).ok).toBe(true);
    const de_novo = await cancelar.executar(responsavel);
    expect(!de_novo.ok && de_novo.erro.codigo).toBe('encerramento-inexistente');
    // Depois de cancelar, um novo pedido recomeça a carência.
    expect((await solicitar.executar(responsavel)).ok).toBe(true);
    expect(auditados).toEqual([
      'privacidade.encerramento-solicitado',
      'privacidade.encerramento-cancelado',
      'privacidade.encerramento-solicitado',
    ]);
  });

  it('carência terminada não cancela; sem permissão é proibido; sem pedido, nenhum', async () => {
    await new SolicitarEncerramento(
      unidade,
      repo,
      trilha,
      relogio('2026-10-07T12:00:00Z'),
    ).executar(responsavel);
    const tarde = await new CancelarEncerramento(
      unidade,
      repo,
      trilha,
      relogio('2026-11-07T12:00:00Z'),
    ).executar(responsavel);
    expect(!tarde.ok && tarde.erro.codigo).toBe('carencia-encerrada');
    const sem = { ...responsavel, podeEncerrar: false };
    const negado = await new SolicitarEncerramento(
      unidade,
      repo,
      trilha,
      relogio('2026-10-07T12:00:00Z'),
    ).executar(sem);
    expect(!negado.ok && negado.erro.codigo).toBe('encerramento-do-escritorio');
    const negadoCancelar = await new CancelarEncerramento(
      unidade,
      repo,
      trilha,
      relogio('2026-10-07T12:00:00Z'),
    ).executar(sem);
    expect(negadoCancelar.ok).toBe(false);
    expect(
      (
        await new ConsultarEncerramento(
          unidade,
          new Repositorio(),
          relogio('2026-10-07T12:00:00Z'),
        ).executar(TENANT)
      ).situacao,
    ).toBe('nenhum');
  });

  it('efetivação: sessões, arquivos, trilha e função do banco, nessa ordem, por tenant vencido', async () => {
    const passos: string[] = [];
    const operacoes: OperacoesDeEncerramento<TransacaoEmMemoria> = {
      vencidos: () => Promise.resolve([TENANT]),
      entrarNoTenant: () => Promise.resolve(void passos.push('tenant')),
      usuariosDoTenant: () => Promise.resolve([USUARIO]),
      exportacoesDoTenant: () => Promise.resolve(['e1' as Uuid]),
      efetivar: () => Promise.resolve(void passos.push('efetivar')),
    };
    const armazenamento = {
      remover: (_t: string, caminho: string) =>
        Promise.resolve(void passos.push(`remover ${caminho}`)),
    } as unknown as ArmazenamentoArquivos;
    const efetivar = new EfetivarEncerramentos(
      unidade,
      operacoes,
      { registrar: () => Promise.resolve(void passos.push('trilha')) },
      { removerTodasDoUsuario: (u) => Promise.resolve(void passos.push(`sessoes ${u}`)) },
      armazenamento,
      relogio('2026-12-01T00:00:00Z'),
    );
    expect(await efetivar.executar()).toEqual([TENANT]);
    expect(passos).toEqual([
      `sessoes ${USUARIO}`,
      'remover privacidade/exportacoes/e1/dados.json',
      'remover privacidade/exportacoes/e1/dados.csv',
      'tenant',
      'trilha',
      'efetivar',
    ]);
  });
});
