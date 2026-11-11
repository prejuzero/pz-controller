import { TrilhaPostgres } from '@pz/auditoria';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CriarFeedDaAgenda, LerFeedDaAgenda, GerarAgendaIcs } from '../application/agenda.js';
import { SolicitarRelatorio } from '../application/relatorios.js';

import { FeedsPostgres, tokensDoFeed } from './feeds-postgres.js';
import { RelatoriosPostgres } from './relatorios-postgres.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Escritórios e pessoas FICTÍCIOS (HU29).
const relogio = new FixedClock(Instant.deIso('2026-11-02T15:00:00Z'));
const A = '01a10e00-0000-7000-8000-0000000d9001' as Uuid;
const B = '01a10e00-0000-7000-8000-0000000d9002' as Uuid;
const ANA = '01a10e00-0000-7000-8000-0000000d9003' as Uuid;

let postgres: BancoDeTeste;
let banco: Banco;
const repo = new RelatoriosPostgres();
const noTenant = <T>(tenant: Uuid, trabalho: (tx: Transacao) => Promise<T>) =>
  executarNoTenant(tenant, () => banco.executar(trabalho));

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  const sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar', async (tx) => {
    await tx.tenant.createMany({
      data: [
        { id: A, nome: 'Escritório A (fictício)', tipo: 'escritorio' },
        { id: B, nome: 'Escritório B (fictício)', tipo: 'escritorio' },
      ],
    });
  });
  await sistema.encerrar();
  banco = new Banco({ url: postgres.url('pz_app') });
}, 120_000);

afterAll(async () => {
  await banco.encerrar();
  await postgres.parar();
});

describe('RelatoriosPostgres (HU29)', () => {
  it('grava o pedido com trilha e evento, conclui e isola por tenant', async () => {
    const solicitar = new SolicitarRelatorio(
      { executar: (t) => noTenant(A, t) },
      repo,
      new TrilhaPostgres(),
      new OutboxPostgres(),
      relogio,
    );
    const r = await solicitar.executar(
      { tenantId: A, usuarioId: ANA, canal: 'portal' },
      { tipo: 'agenda', formato: 'xlsx', filtros: { de: '2026-11-01', ate: '2026-11-30' } },
    );
    if (!r.ok) throw r.erro;
    const id = r.valor.id;

    const [pendente] = await noTenant(A, (tx) => repo.recentes(tx, ANA, 10));
    expect(pendente).toMatchObject({
      id,
      tipo: 'agenda',
      formato: 'xlsx',
      situacao: 'pendente',
      filtros: { de: '2026-11-01', ate: '2026-11-30' },
    });
    const eventos = await noTenant(A, (tx) =>
      tx.eventoDominio.findMany({ where: { tipo: 'RelatorioSolicitado' } }),
    );
    expect(eventos).toHaveLength(1);
    const trilha = await noTenant(A, (tx) =>
      tx.eventoAuditoria.findMany({ where: { entidadeId: id } }),
    );
    expect(trilha.map((t) => t.tipo)).toEqual(['relatorios.exportacao-solicitada']);

    await noTenant(A, (tx) =>
      repo.concluir(tx, id, {
        em: relogio.agora(),
        expiraEm: relogio.agora().maisMs(86_400_000),
        linhas: 3,
      }),
    );
    expect(await noTenant(A, (tx) => repo.buscar(tx, id))).toMatchObject({
      situacao: 'concluido',
      linhas: 3,
    });
    // Outro escritório não vê o pedido (RLS).
    expect(await noTenant(B, (tx) => repo.buscar(tx, id))).toBeUndefined();

    // Concluído não volta a falhar.
    await noTenant(A, (tx) => repo.falhar(tx, id));
    expect((await noTenant(A, (tx) => repo.buscar(tx, id)))?.situacao).toBe('concluido');
    const outro = await solicitar.executar(
      { tenantId: A, usuarioId: ANA, canal: 'portal' },
      { tipo: 'busca-prazos', formato: 'pdf', filtros: {} },
    );
    if (!outro.ok) throw outro.erro;
    expect(await noTenant(A, (tx) => repo.falhar(tx, outro.valor.id))).toBe(true);
    expect(await noTenant(A, (tx) => repo.falhar(tx, outro.valor.id))).toBe(false);
    expect((await noTenant(A, (tx) => repo.buscar(tx, outro.valor.id)))?.situacao).toBe('falhou');

    // Limpeza (PZ-353): o sistema lista os vencidos de todos os escritórios e marca a remoção.
    const sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
    const depois = relogio.agora().maisMs(48 * 3_600_000);
    const vencidos = await sistema.executarComoSistema('teste: relatórios vencidos', (tx) =>
      repo.expiradosComArquivo(tx, depois, 10),
    );
    expect(vencidos).toEqual([{ id, tenantId: A, formato: 'xlsx' }]);
    await sistema.executarComoSistema('teste: marcar remoção', (tx) =>
      repo.marcarArquivoRemovido(tx, id, depois),
    );
    expect(
      await sistema.executarComoSistema('teste: relatórios vencidos', (tx) =>
        repo.expiradosComArquivo(tx, depois, 10),
      ),
    ).toEqual([]);
    expect((await noTenant(A, (tx) => repo.buscar(tx, id)))?.arquivoRemovidoEm).toBeDefined();
    await sistema.encerrar();
  });
});

describe('FeedsPostgres (HU50)', () => {
  it('só o hash no banco, leitura pela função restrita, isolamento e escritório suspenso', async () => {
    const sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
    await sistema.executarComoSistema('preparar', (tx) =>
      tx.usuario.create({
        data: { id: ANA, tenantId: A, nome: 'Ana (fictícia)', email: 'ana.feed@exemplo.invalid' },
      }),
    );
    const feeds = new FeedsPostgres(banco);
    const unidade = { executar: <T>(t: (tx: Transacao) => Promise<T>) => noTenant(A, t) };
    const criar = new CriarFeedDaAgenda(
      unidade,
      feeds,
      tokensDoFeed,
      new TrilhaPostgres(),
      relogio,
    );
    const { token } = await criar.executar({ tenantId: A, usuarioId: ANA, canal: 'portal' });
    const ler = new LerFeedDaAgenda(
      banco,
      feeds,
      tokensDoFeed,
      (tenant, trabalho) => executarNoTenant(tenant, trabalho),
      new GerarAgendaIcs(
        { prazosAbertos: () => Promise.resolve([]) },
        relogio,
        'https://p.invalid',
      ),
      relogio,
    );
    const lido = await ler.executar(token);
    expect(lido.ok && lido.valor).toContain('BEGIN:VCALENDAR');
    const gravado = await sistema.executarComoSistema('conferir', (tx) =>
      tx.feedAgenda.findFirstOrThrow({ where: { usuarioId: ANA } }),
    );
    expect(gravado.tokenHash).toBe(tokensDoFeed.hash(token));
    expect(gravado.ultimoAcesso).not.toBeNull();
    // Outro escritório não vê o feed (RLS).
    expect(await noTenant(B, (tx) => feeds.ativo(tx, ANA))).toBeUndefined();
    // Escritório suspenso: o feed para de responder.
    await sistema.executarComoSistema('suspender', (tx) =>
      tx.tenant.update({
        where: { id: A },
        data: { suspensoEm: new Date(), motivoSuspensao: 'teste fictício' },
      }),
    );
    expect((await ler.executar(token)).ok).toBe(false);
    await sistema.executarComoSistema('reativar', (tx) =>
      tx.tenant.update({ where: { id: A }, data: { suspensoEm: null, motivoSuspensao: null } }),
    );
    await expect(noTenant(A, (tx) => tx.feedAgenda.deleteMany({}))).rejects.toThrow();
    await sistema.encerrar();
  });
});
