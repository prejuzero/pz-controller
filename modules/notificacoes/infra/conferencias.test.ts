import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { LembrarConferencias } from '../application/conferencias.js';
import { Notificar } from '../application/notificacoes.js';
import { renderizar } from '../application/templates.js';

import { ConsentimentosEmMemoria, NotificacoesEmMemoria } from './em-memoria.js';

import type { ConferenciaDevida } from '../application/conferencias.js';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS (HU36). Hoje: 12/11/2026 em Brasília.
const relogio = new FixedClock(Instant.deIso('2026-11-12T11:00:00Z'));
const A = gerarUuidV7();
const B = gerarUuidV7();
const ANA = gerarUuidV7();
const P1 = '01a10e00-0000-7000-8000-0000000dc001' as Uuid;
const P2 = '01a10e00-0000-7000-8000-0000000dc002' as Uuid;

function montar(devidas: Record<string, ConferenciaDevida[]>) {
  const repositorio = new NotificacoesEmMemoria();
  const outbox = new OutboxEmMemoria();
  let tenantAtual: Uuid | undefined;
  const notificar = new Notificar(
    repositorio,
    { ativo: () => Promise.resolve(undefined), antecedencias: () => Promise.resolve(undefined) },
    { emails: (_tx, id) => Promise.resolve({ principal: `${id}@exemplo.invalid`, copias: [] }) },
    { suprimidos: () => Promise.resolve(new Set()), suprimir: () => Promise.resolve() },
    new ConsentimentosEmMemoria(),
    outbox,
    relogio,
  );
  const lembrar = new LembrarConferencias(
    outbox,
    () => Promise.resolve([A, B]),
    async (tenantId, trabalho) => {
      tenantAtual = tenantId;
      return trabalho();
    },
    outbox,
    () => Promise.resolve(devidas[tenantAtual ?? ''] ?? []),
    { usuarios: () => Promise.resolve([ANA]) },
    notificar,
    'https://app.exemplo.invalid',
    relogio,
  );
  return { lembrar, repositorio };
}

const devida = (sobre: Partial<ConferenciaDevida>): ConferenciaDevida => ({
  processoId: P1,
  numeroCnj: '0000001-09.2030.8.09.0001',
  sigiloso: false,
  proxima: '2026-11-07',
  lembrarHoje: true,
  ...sobre,
});

describe('lembretes de conferência de painel (HU36)', () => {
  it('avisa só os devidos hoje; sigiloso sem número; repetir no dia não duplica', async () => {
    const { lembrar, repositorio } = montar({
      [A]: [
        devida({}),
        devida({ processoId: P2, sigiloso: true, proxima: '2026-11-12' }),
        devida({ processoId: gerarUuidV7(), lembrarHoje: false }),
      ],
      [B]: [devida({ lembrarHoje: false })],
    });
    expect(await lembrar.executar()).toEqual({ escritorios: 2, avisos: 2 });
    const pagina = 'https://app.exemplo.invalid/conferencias';
    expect(repositorio.todas().map((n) => n.tipo)).toEqual([
      'conferencia-painel',
      'conferencia-painel',
    ]);
    const dados: unknown[] = repositorio.todas().map((n) => n.dados);
    expect(dados).toEqual([
      { numeroProcesso: '0000001-09.2030.8.09.0001', desde: '07/11/2026', link: pagina },
      { desde: '12/11/2026', link: pagina },
    ]);
    expect(await lembrar.executar()).toEqual({ escritorios: 2, avisos: 0 });
  });

  it('e-mail de processo sigiloso não identifica o processo', async () => {
    const m = await renderizar('conferencia-painel', {
      desde: '12/11/2026',
      link: 'https://app.exemplo.invalid/conferencias',
    });
    expect(m.assunto).toBe('Confira o painel do tribunal de um processo sigiloso');
    expect(m.texto).toContain('Um processo sigiloso não é monitorado automaticamente');
    expect(m.texto).not.toMatch(/\d{7}-\d{2}/);
  });
});
