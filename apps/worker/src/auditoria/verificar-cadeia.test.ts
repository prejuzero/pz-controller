import { describe, expect, it } from 'vitest';

import { relatorioDaVerificacao } from './verificar-cadeia.js';

describe('relatório da verificação da trilha (PZ-221)', () => {
  it('íntegra: total de registros e nenhuma divergência', () => {
    const r = relatorioDaVerificacao([
      { tenantId: 't1', situacao: 'integra', registros: 10 },
      { tenantId: 't2', situacao: 'integra', registros: 5 },
    ]);
    expect(r.integra).toBe(true);
    expect(r.texto).toContain('2 tenant(s), 15 registro(s)');
    expect(r.texto).toContain('Cadeia íntegra em todos os tenants.');
  });

  it('divergente: aponta o tenant e a sequência', () => {
    const r = relatorioDaVerificacao([
      { tenantId: 't1', situacao: 'divergente', sequencia: 3, motivo: 'hash não confere' },
    ]);
    expect(r.integra).toBe(false);
    expect(r.texto).toContain('DIVERGENTE tenant t1 na sequência 3: hash não confere');
    expect(r.texto).toContain('Cadeia NÃO íntegra.');
  });
});
