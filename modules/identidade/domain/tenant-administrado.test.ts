import { Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { alterarAssinatura, reativar, suspender } from './tenant-administrado.js';

import type { TenantAdministrado } from './tenant-administrado.js';

const agora = Instant.deIso('2026-10-08T15:00:00Z');
const escritorio: TenantAdministrado = {
  id: '0199c4a0-0000-7000-8000-000000000001' as TenantAdministrado['id'],
  nome: 'Escritório Fictício',
  tipo: 'escritorio',
  plano: null,
  situacaoAssinatura: 'teste',
  criadoEm: Instant.deIso('2026-10-01T12:00:00Z'),
};
const motivo = 'Chamado 123: inadimplência confirmada';

describe('administração de tenants (HU39)', () => {
  it('suspende com motivo e instante; suspender de novo não muda nada', () => {
    const r = suspender(escritorio, motivo, agora);
    expect(r).toMatchObject({ ok: true, valor: { suspensao: { em: agora, motivo } } });
    if (!r.ok) return;
    const deNovo = suspender(r.valor, 'outro motivo qualquer', agora);
    expect(deNovo).toEqual({ ok: true, valor: r.valor });
  });

  it('reativa só o que está suspenso', () => {
    const s = suspender(escritorio, motivo, agora);
    if (!s.ok) throw s.erro;
    const r = reativar(s.valor);
    expect(r.ok && r.valor.suspensao).toBeUndefined();
    expect(reativar(escritorio)).toEqual({ ok: true, valor: escritorio });
  });

  it('plataforma não se administra (responde como inexistente); encerrado não muda', () => {
    const plataforma = { ...escritorio, tipo: 'plataforma' as const };
    for (const r of [
      suspender(plataforma, motivo, agora),
      reativar(plataforma),
      alterarAssinatura(plataforma, { plano: 'x' }),
    ]) {
      expect(r).toMatchObject({ ok: false, erro: { codigo: 'tenant-inexistente' } });
    }
    const encerrado = { ...escritorio, encerradoEm: agora };
    expect(suspender(encerrado, motivo, agora)).toMatchObject({
      ok: false,
      erro: { codigo: 'tenant-encerrado' },
    });
    expect(alterarAssinatura(encerrado, { situacaoAssinatura: 'ativa' })).toMatchObject({
      ok: false,
      erro: { codigo: 'tenant-encerrado' },
    });
  });

  it('altera plano e situação da assinatura (manual no MVP); campo ausente fica como está', () => {
    const r = alterarAssinatura(escritorio, {
      plano: 'Escritório 10',
      situacaoAssinatura: 'ativa',
    });
    expect(r).toMatchObject({
      ok: true,
      valor: { plano: 'Escritório 10', situacaoAssinatura: 'ativa' },
    });
    if (!r.ok) return;
    expect(alterarAssinatura(r.valor, { plano: null })).toMatchObject({
      ok: true,
      valor: { plano: null, situacaoAssinatura: 'ativa' },
    });
  });
});
