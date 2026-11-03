import { FixedClock, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsultarConferencias, RegistrarConferencia } from '../application/conferencias.js';

import type {
  ConferenciaRegistrada,
  ProcessoParaConferir,
  RepositorioDeConferencias,
} from '../application/conferencias.js';
import type { EntradaDeAuditoria } from '@pz/auditoria';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS (HU36). Hoje: 12/11/2026, 10h em Brasília.
const relogio = new FixedClock(Instant.deIso('2026-11-12T13:00:00Z'));
const TENANT = '01a10e00-0000-7000-8000-0000000da001' as Uuid;
const ANA = '01a10e00-0000-7000-8000-0000000da002' as Uuid;
const P1 = '01a10e00-0000-7000-8000-0000000da003' as Uuid;
const P2 = '01a10e00-0000-7000-8000-0000000da004' as Uuid;
const autor = { tenantId: TENANT, usuarioId: ANA, canal: 'portal' as const };

class ConferenciasEmMemoria implements RepositorioDeConferencias<unknown> {
  readonly inseridas: ConferenciaRegistrada[] = [];
  constructor(private readonly processos: Omit<ProcessoParaConferir, 'ultima'>[]) {}
  existeProcesso(_tx: unknown, id: Uuid) {
    return Promise.resolve(this.processos.some((p) => p.processoId === id));
  }
  inserir(_tx: unknown, c: ConferenciaRegistrada) {
    this.inseridas.push(c);
    return Promise.resolve();
  }
  paraConferir(): Promise<ProcessoParaConferir[]> {
    return Promise.resolve(
      this.processos.map((p) => {
        const ultima = this.inseridas.filter((c) => c.processoId === p.processoId).at(-1);
        return {
          ...p,
          ultima:
            ultima === undefined
              ? null
              : { realizadaEm: ultima.realizadaEm, resultado: ultima.resultado },
        };
      }),
    );
  }
}

function montar() {
  const repo = new ConferenciasEmMemoria([
    {
      processoId: P1,
      numeroCnj: '00000010920308090001',
      tribunal: 'TJGO',
      cobertura: 'manual',
      sigiloso: false,
      periodicidade: null,
      // Cadastrado em 02/11 (23h em Brasília: ainda dia 02).
      desde: Instant.deIso('2026-11-03T02:00:00Z'),
    },
    {
      processoId: P2,
      numeroCnj: '123',
      tribunal: null,
      cobertura: 'automatica',
      sigiloso: true,
      periodicidade: 3,
      desde: Instant.deIso('2026-11-11T12:00:00Z'),
    },
  ]);
  const auditados: EntradaDeAuditoria[] = [];
  const unidade = new OutboxEmMemoria();
  const trilha = {
    registrar: (tx: unknown, e: EntradaDeAuditoria) => {
      (tx as { aoConfirmar(f: () => void): void }).aoConfirmar(() => auditados.push(e));
      return Promise.resolve();
    },
  };
  return {
    repo,
    auditados,
    registrar: new RegistrarConferencia(unidade, repo, trilha, relogio),
    consultar: new ConsultarConferencias(unidade, repo, relogio),
  };
}

describe('conferências de painel (HU36)', () => {
  it('lista os processos com a próxima data; atrasados primeiro', async () => {
    const { consultar } = montar();
    expect(await consultar.executar()).toEqual([
      expect.objectContaining({
        processoId: P1,
        numeroCnj: '0000001-09.2030.8.09.0001',
        periodicidade: 5,
        proxima: '2026-11-07',
        atrasada: true,
        lembrarHoje: true,
        ultimaConferencia: null,
      }),
      expect.objectContaining({
        processoId: P2,
        numeroCnj: '123',
        proxima: '2026-11-14',
        atrasada: false,
      }),
    ]);
  });

  it('registrar reinicia a contagem e vai para a trilha sem a observação', async () => {
    const { registrar, consultar, auditados, repo } = montar();
    const r = await registrar.executar(autor, P1, {
      resultado: 'sem-novidade',
      observacao: '  conferido no PJe  ',
    });
    if (!r.ok) throw r.erro;
    expect(r.valor).toMatchObject({
      tenantId: TENANT,
      usuarioId: ANA,
      observacao: 'conferido no PJe',
      realizadaEm: relogio.agora(),
    });
    expect(auditados).toEqual([
      expect.objectContaining({
        tipo: 'cadastro.conferencia-registrada',
        entidadeId: P1,
        depois: { conferenciaId: r.valor.id, resultado: 'sem-novidade', comObservacao: true },
      }),
    ]);
    const [, p1] = await consultar.executar();
    expect(p1).toMatchObject({
      processoId: P1,
      proxima: '2026-11-17',
      atrasada: false,
      ultimaConferencia: { resultado: 'sem-novidade' },
    });
    const vazia = await registrar.executar(autor, P1, {
      resultado: 'nova-intimacao',
      observacao: ' ',
    });
    expect(vazia.ok && vazia.valor.observacao).toBeNull();
    expect(repo.inseridas).toHaveLength(2);
  });

  it('recusa resultado inválido e processo inexistente', async () => {
    const { registrar } = montar();
    expect((await registrar.executar(autor, P1, { resultado: 'talvez' })).ok).toBe(false);
    const inexistente = await registrar.executar(autor, ANA, { resultado: 'sem-novidade' });
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('processo-nao-encontrado');
  });
});
