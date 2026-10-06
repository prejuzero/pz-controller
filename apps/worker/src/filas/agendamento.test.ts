import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AGENDAMENTOS, definirAgendamento, FUSO_DO_AGENDADOR } from './agendamento.js';
import { definirJob } from './job.js';

const global = definirJob({
  fila: 'manutencao',
  tipo: 'manutencao.teste',
  dados: z.object({}),
  global: true,
});
const deTenant = definirJob({ fila: 'prazos', tipo: 'prazos.teste', dados: z.object({}) });

describe('agendamentos (HU10)', () => {
  it('rodam no fuso de Brasília', () => {
    expect(FUSO_DO_AGENDADOR).toBe('America/Sao_Paulo');
  });

  it('exigem ID estável e job global', () => {
    const base = { job: global, cron: '0 3 * * *', dados: {}, motivo: 'teste' };
    expect(definirAgendamento({ ...base, id: 'manutencao.ok' }).id).toBe('manutencao.ok');
    expect(() => definirAgendamento({ ...base, id: 'Com Espaco' })).toThrow('minúsculo');
    expect(() => definirAgendamento({ ...base, id: 'x', job: deTenant })).toThrow('job global');
  });

  it('o catálogo tem a limpeza diária do outbox às 3h, com IDs únicos', () => {
    expect(AGENDAMENTOS.map((a) => [a.id, a.job.tipo, a.cron])).toContainEqual([
      'manutencao.limpar-outbox',
      'manutencao.limpar-outbox',
      '0 3 * * *',
    ]);
    expect(new Set(AGENDAMENTOS.map((a) => a.id)).size).toBe(AGENDAMENTOS.length);
  });
});
