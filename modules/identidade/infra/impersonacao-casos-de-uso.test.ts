import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConsultarPermissoes } from '../application/autorizacao.js';
import { EncerrarImpersonacao, IniciarImpersonacao } from '../application/impersonacao.js';
import { DURACAO_DA_IMPERSONACAO_MS } from '../domain/impersonacao.js';
import { somenteLeitura, PERMISSOES } from '../domain/permissoes.js';

import { PerfisEmMemoria, SessoesEmMemoria, TenantsEmMemoria } from './em-memoria.js';

import type { DependenciasDaImpersonacao } from '../application/impersonacao.js';
import type { NoTenant } from '../application/redefinicao.js';
import type { Sessao } from '../domain/sessao.js';
import type { EntradaDeAuditoria, OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

const inicio = Instant.deIso('2026-10-06T12:00:00Z');
const relogio = new FixedClock(inicio);
const PLATAFORMA = gerarUuidV7(relogio);
const ESCRITORIO = gerarUuidV7(relogio);
const OUTRA_PLATAFORMA = gerarUuidV7(relogio);
const contexto = { ip: '203.0.113.7', userAgent: 'teste' };
const TOKEN = 'token-do-admin';

interface Registro {
  readonly tenantId: Uuid | undefined;
  readonly entrada: EntradaDeAuditoria;
  readonly origem: OrigemDaAuditoria;
}

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

class TrilhaFalsa implements TrilhaDeAuditoria<TransacaoEmMemoria> {
  readonly registros: Registro[] = [];
  falharNo: Uuid | undefined;
  registrar(tx: TransacaoEmMemoria, entrada: EntradaDeAuditoria, origem: OrigemDaAuditoria) {
    const tenantId = tenantDaExecucao;
    if (tenantId === this.falharNo) return Promise.reject(new Error('trilha indisponível'));
    tx.aoConfirmar(() => this.registros.push({ tenantId, entrada, origem }));
    return Promise.resolve();
  }
}

let sessoes: SessoesEmMemoria;
let trilha: TrilhaFalsa;
let deps: DependenciasDaImpersonacao<TransacaoEmMemoria>;
let admin: Sessao;

beforeEach(async () => {
  sessoes = new SessoesEmMemoria();
  trilha = new TrilhaFalsa();
  const tenants = new TenantsEmMemoria();
  tenants.cadastrar(PLATAFORMA, 'plataforma');
  tenants.cadastrar(ESCRITORIO, 'escritorio');
  tenants.cadastrar(OUTRA_PLATAFORMA, 'plataforma');
  deps = { sessoes, unidade: new OutboxEmMemoria(), tenants, trilha, noTenant, relogio };
  admin = {
    id: gerarUuidV7(relogio),
    usuarioId: gerarUuidV7(relogio),
    tenantId: PLATAFORMA,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: inicio,
    ultimoUso: inicio,
  };
  await sessoes.gravar(TOKEN, admin);
});

const iniciar = (tenantId: Uuid = ESCRITORIO, motivo = 'Chamado 42: prazo sumiu') =>
  new IniciarImpersonacao(deps).executar(TOKEN, admin, { tenantId, motivo }, contexto);

describe('IniciarImpersonacao (HU07)', () => {
  it('grava na sessão e audita no tenant acessado e no plataforma, com motivo e validade', async () => {
    const r = await iniciar();
    expect(r.ok).toBe(true);
    const gravada = await sessoes.obter(TOKEN);
    expect(gravada?.impersonacao?.tenantId).toBe(ESCRITORIO);
    expect(gravada?.tenantId).toBe(PLATAFORMA);
    expect(trilha.registros.map((r) => r.tenantId)).toEqual([ESCRITORIO, PLATAFORMA]);
    for (const { entrada, origem } of trilha.registros) {
      expect(entrada.tipo).toBe('identidade.impersonacao-iniciada');
      expect(entrada.depois).toMatchObject({
        administradorId: admin.usuarioId,
        tenantAcessado: ESCRITORIO,
        motivo: 'Chamado 42: prazo sumiu',
        expiraEm: inicio.maisMs(DURACAO_DA_IMPERSONACAO_MS).paraIso(),
      });
      expect(origem).toMatchObject({ canal: 'portal', usuarioId: admin.usuarioId, ...contexto });
    }
  });

  it('tenant inexistente ou da plataforma: 404 igual, sem auditoria nem mudança na sessão', async () => {
    for (const alvo of [gerarUuidV7(relogio), OUTRA_PLATAFORMA]) {
      const r = await iniciar(alvo);
      expect(r.ok ? undefined : r.erro.codigo).toBe('tenant-inexistente');
    }
    expect(trilha.registros).toHaveLength(0);
    expect((await sessoes.obter(TOKEN))?.impersonacao).toBeUndefined();
  });

  it('sem rastro, sem acesso: falha da trilha no plataforma não ativa a impersonação', async () => {
    trilha.falharNo = PLATAFORMA;
    await expect(iniciar()).rejects.toThrow('trilha indisponível');
    expect((await sessoes.obter(TOKEN))?.impersonacao).toBeUndefined();
  });

  it('recusa motivo curto', async () => {
    const r = await iniciar(ESCRITORIO, 'curto');
    expect(r.ok ? undefined : r.erro.codigo).toBe('validacao');
  });
});

describe('EncerrarImpersonacao (HU07)', () => {
  it('limpa a sessão e audita o encerramento nos dois tenants', async () => {
    const r = await iniciar();
    if (!r.ok) throw r.erro;
    const encerrada = await new EncerrarImpersonacao(deps).executar(TOKEN, r.valor, contexto);
    expect(encerrada.impersonacao).toBeUndefined();
    expect((await sessoes.obter(TOKEN))?.impersonacao).toBeUndefined();
    const fim = trilha.registros.filter(
      (x) => x.entrada.tipo === 'identidade.impersonacao-encerrada',
    );
    expect(fim.map((x) => x.tenantId)).toEqual([ESCRITORIO, PLATAFORMA]);
    expect(fim[0]?.entrada.depois).toMatchObject({ encerradaEm: inicio.paraIso() });
  });

  it('sem impersonação em curso não faz nada', async () => {
    await new EncerrarImpersonacao(deps).executar(TOKEN, admin, contexto);
    expect(trilha.registros).toHaveLength(0);
  });
});

describe('permissões durante a impersonação (HU07)', () => {
  it('só leitura enquanto o administrador mantém admin:impersonar', async () => {
    const perfis = new PerfisEmMemoria();
    const consultar = new ConsultarPermissoes(perfis, () => undefined);
    const r = await iniciar();
    if (!r.ok) throw r.erro;
    expect((await consultar.executar(r.valor)).size).toBe(0);
    perfis.atribuir(admin.usuarioId, 'admin_plataforma');
    expect([...(await consultar.executar(r.valor))].sort()).toEqual(
      [...somenteLeitura(PERMISSOES), 'admin:impersonar'].sort(),
    );
  });
});
