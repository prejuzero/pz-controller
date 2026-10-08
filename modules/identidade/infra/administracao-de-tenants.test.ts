import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AlterarAssinatura,
  DetalharTenant,
  ListarTenants,
  ReativarTenant,
  SuspenderTenant,
} from '../application/administracao-de-tenants.js';

import { SessoesEmMemoria, TenantsEmMemoria } from './em-memoria.js';

import type {
  Administrador,
  DependenciasDaAdministracaoDeTenants,
} from '../application/administracao-de-tenants.js';
import type { NoTenant } from '../application/redefinicao.js';
import type { Sessao } from '../domain/sessao.js';
import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

const agora = Instant.deIso('2026-10-08T15:00:00Z');
const relogio = new FixedClock(agora);
// Ids fixos: a listagem ordena por id (o escritório é o mais novo).
const PLATAFORMA = '0199c4a0-0000-7000-8000-000000000001' as Uuid;
const ESCRITORIO = '0199c4a0-0000-7000-8000-000000000002' as Uuid;
const ADVOGADA = gerarUuidV7(relogio);
const MOTIVO = 'Chamado 77: inadimplência confirmada';

let tenantDaExecucao: Uuid | undefined;
const noTenant: NoTenant = async (tenantId, trabalho) => {
  const anterior = tenantDaExecucao;
  tenantDaExecucao = tenantId;
  try {
    return await trabalho();
  } finally {
    tenantDaExecucao = anterior;
  }
};

let registros: { tenantId: Uuid | undefined; entrada: EntradaDeAuditoria }[];
const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
  registrar(tx, entrada) {
    const tenantId = tenantDaExecucao;
    tx.aoConfirmar(() => registros.push({ tenantId, entrada }));
    return Promise.resolve();
  },
};

let sessoes: SessoesEmMemoria;
let deps: DependenciasDaAdministracaoDeTenants<TransacaoEmMemoria>;
const admin: Administrador = {
  usuarioId: gerarUuidV7(relogio),
  tenantId: PLATAFORMA,
  ip: '203.0.113.7',
  userAgent: 'teste',
};

beforeEach(async () => {
  registros = [];
  sessoes = new SessoesEmMemoria();
  const tenants = new TenantsEmMemoria();
  tenants.cadastrar(PLATAFORMA, 'plataforma');
  tenants.cadastrar(ESCRITORIO, 'escritorio', { usuarios: [ADVOGADA] });
  deps = { unidade: new OutboxEmMemoria(), tenants, trilha, noTenant, sessoes, relogio };
  const sessao: Sessao = {
    id: gerarUuidV7(relogio),
    usuarioId: ADVOGADA,
    tenantId: ESCRITORIO,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: agora,
    ultimoUso: agora,
  };
  await sessoes.gravar('token-da-advogada', sessao);
});

describe('administração de tenants (HU39, PZ-228)', () => {
  it('lista do mais novo para o mais antigo, com cursor', async () => {
    const listar = new ListarTenants(deps);
    const primeira = await listar.executar({ limite: 1 });
    expect(primeira.itens.map((t) => t.id)).toEqual([ESCRITORIO]);
    expect(primeira.proximoCursor).toBe(ESCRITORIO);
    const segunda = await listar.executar({ limite: 1, apos: ESCRITORIO });
    expect(segunda).toMatchObject({ itens: [{ id: PLATAFORMA }], proximoCursor: null });
  });

  it('detalha; o tenant da plataforma e o inexistente respondem 404', async () => {
    const detalhar = new DetalharTenant(deps);
    expect(await detalhar.executar(ESCRITORIO)).toMatchObject({
      ok: true,
      valor: { id: ESCRITORIO },
    });
    for (const id of [PLATAFORMA, gerarUuidV7(relogio)]) {
      expect(await detalhar.executar(id)).toMatchObject({
        ok: false,
        erro: { codigo: 'tenant-inexistente' },
      });
    }
  });

  it('suspende: derruba as sessões e audita nos dois tenants; repetir não audita de novo', async () => {
    const suspender = new SuspenderTenant(deps);
    const r = await suspender.executar(admin, ESCRITORIO, MOTIVO);
    expect(r).toMatchObject({ ok: true, valor: { suspensao: { em: agora, motivo: MOTIVO } } });
    expect(await sessoes.obter('token-da-advogada')).toBeUndefined();
    expect(registros.map((x) => [x.tenantId, x.entrada.tipo])).toEqual([
      [ESCRITORIO, 'identidade.tenant-suspenso'],
      [PLATAFORMA, 'identidade.tenant-suspenso'],
    ]);
    expect(registros[0]?.entrada).toMatchObject({
      entidade: 'tenant',
      entidadeId: ESCRITORIO,
      antes: { suspensoEm: null },
      depois: { suspensoEm: agora.paraIso(), motivoSuspensao: MOTIVO },
    });
    expect((await suspender.executar(admin, ESCRITORIO, MOTIVO)).ok).toBe(true);
    expect(registros).toHaveLength(2);
  });

  it('reativa e altera a assinatura, auditando antes e depois', async () => {
    await new SuspenderTenant(deps).executar(admin, ESCRITORIO, MOTIVO);
    const r = await new ReativarTenant(deps).executar(admin, ESCRITORIO);
    expect(r.ok && r.valor.suspensao).toBeUndefined();
    const a = await new AlterarAssinatura(deps).executar(admin, ESCRITORIO, {
      plano: 'Escritório 10',
      situacaoAssinatura: 'ativa',
    });
    expect(a).toMatchObject({
      ok: true,
      valor: { plano: 'Escritório 10', situacaoAssinatura: 'ativa' },
    });
    expect(registros.map((x) => x.entrada.tipo)).toEqual([
      'identidade.tenant-suspenso',
      'identidade.tenant-suspenso',
      'identidade.tenant-reativado',
      'identidade.tenant-reativado',
      'identidade.assinatura-alterada',
      'identidade.assinatura-alterada',
    ]);
  });

  it('erros não alteram nem auditam', async () => {
    const r = await new SuspenderTenant(deps).executar(admin, PLATAFORMA, MOTIVO);
    expect(r).toMatchObject({ ok: false, erro: { codigo: 'tenant-inexistente' } });
    const s = await new ReativarTenant(deps).executar(admin, gerarUuidV7(relogio));
    expect(s.ok).toBe(false);
    expect(registros).toEqual([]);
  });
});
