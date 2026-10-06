import { OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import { ReprocessarJobMorto } from '../application/reprocessar-job-morto.js';

import { FilaDeMortosEmMemoria } from './fila-de-mortos-em-memoria.js';

import type { JobMorto } from '../domain/job-morto.js';
import type { EntradaDeAuditoria, OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria } from '@pz/kernel';

const MORTO: JobMorto = {
  fila: 'notificacoes',
  jobId: 'notificacao.email-abc',
  tipo: 'notificacao.email',
  erro: 'SMTP fora do ar',
  tentativas: 6,
  falhouEm: '2026-10-06T12:00:00.000Z',
  originalDisponivel: true,
};
const PEDIDO = {
  fila: 'notificacoes',
  jobId: 'notificacao.email-abc',
  motivo: 'SMTP voltou (chamado 77)',
  usuarioId: 'admin-1',
  ip: '203.0.113.9',
  userAgent: 'teste',
};

let mortos: FilaDeMortosEmMemoria;
let registros: { entrada: EntradaDeAuditoria; origem: OrigemDaAuditoria }[];
let caso: ReprocessarJobMorto<TransacaoEmMemoria>;

beforeEach(() => {
  mortos = new FilaDeMortosEmMemoria();
  registros = [];
  const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
    registrar(tx, entrada, origem) {
      tx.aoConfirmar(() => registros.push({ entrada, origem }));
      return Promise.resolve();
    },
  };
  caso = new ReprocessarJobMorto({ filaDeMortos: mortos, unidade: new OutboxEmMemoria(), trilha });
});

describe('reprocessar job da DLQ (HU07)', () => {
  it('devolve o job à fila e audita quem, por quê e qual falha, sem os dados do job', async () => {
    mortos.morrer(MORTO);
    expect((await caso.executar(PEDIDO)).ok).toBe(true);
    expect(mortos.reprocessados).toEqual([MORTO]);
    expect(registros).toEqual([
      {
        entrada: {
          tipo: 'administracao.job-morto-reprocessado',
          entidade: 'job',
          entidadeId: 'notificacoes/notificacao.email-abc',
          antes: {
            fila: 'notificacoes',
            jobId: 'notificacao.email-abc',
            tipo: 'notificacao.email',
            erro: 'SMTP fora do ar',
            tentativas: 6,
            falhouEm: '2026-10-06T12:00:00.000Z',
            motivo: 'SMTP voltou (chamado 77)',
          },
        },
        origem: { canal: 'portal', usuarioId: 'admin-1', ip: '203.0.113.9', userAgent: 'teste' },
      },
    ]);
  });

  it('job fora da DLQ: não encontrado e nada auditado', async () => {
    const resultado = await caso.executar(PEDIDO);
    expect(!resultado.ok && resultado.erro.codigo).toBe('job-morto-inexistente');
    expect(registros).toEqual([]);
  });

  it('original já apagado da fila: conflito e nada auditado', async () => {
    mortos.morrer({ ...MORTO, originalDisponivel: false });
    const resultado = await caso.executar(PEDIDO);
    expect(!resultado.ok && resultado.erro.codigo).toBe('job-original-indisponivel');
    expect(registros).toEqual([]);
    expect(mortos.reprocessados).toEqual([]);
  });

  it('falha na fila desfaz a auditoria (nada fica registrado como reprocessado)', async () => {
    mortos.morrer(MORTO);
    mortos.falharAoReprocessar = true;
    await expect(caso.executar(PEDIDO)).rejects.toThrow('Redis indisponível');
    expect(registros).toEqual([]);
  });
});
