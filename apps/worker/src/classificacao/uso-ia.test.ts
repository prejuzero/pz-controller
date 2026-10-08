import { LocalDate } from '@pz/kernel';
import { describe, expect, it, vi } from 'vitest';

import { registroDeUsoDeIa } from './uso-ia.js';

import type { Transacao } from '@pz/db';
import type { Logger } from '@pz/observability';

describe('registro do uso de IA no worker (HU21)', () => {
  it('grava sem tenant, com motivo, e loga erro quando o custo do dia passa do orçamento', async () => {
    const motivos: string[] = [];
    const sqls: string[] = [];
    const tx = {
      $executeRaw: (partes: TemplateStringsArray) => {
        sqls.push(partes.join('?'));
        return Promise.resolve(1);
      },
      usoIa: {
        aggregate: () => Promise.resolve({ _sum: { custoEstimadoUsd: { toNumber: () => 25 } } }),
      },
    } as unknown as Transacao; // dublê mínimo: só o que o adaptador usa
    const banco = {
      executarSemTenant: <T>(motivo: string, trabalho: (t: Transacao) => Promise<T>) => {
        motivos.push(motivo);
        return trabalho(tx);
      },
    };
    const error = vi.fn();
    const logger = { error } as unknown as Logger; // dublê mínimo: só o nível usado

    await registroDeUsoDeIa(banco, 20, logger).registrar({
      dia: LocalDate.de(2026, 10, 8),
      tarefa: 'classificar-ato',
      modelo: 'claude-haiku-4-5',
      uso: { tokensEntrada: 1, tokensSaida: 1, tokensCacheLidos: 0 },
      custoUsd: 0.001,
    });

    expect(motivos).toEqual(['registro do uso de IA', 'registro do uso de IA']);
    expect(sqls[0]).toContain('ON CONFLICT (dia, tarefa, modelo)');
    expect(error).toHaveBeenCalledWith(
      { dia: '2026-10-08', custoUsd: 25, orcamentoUsd: 20 },
      'custo diário de IA acima do orçamento',
    );
  });
});
