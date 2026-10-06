import { TrilhaPostgres } from '@pz/auditoria';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AprovarEventoDoCalendario,
  CadastrarFeriadoLocal,
  ConsultarCalendario,
  ConsultarDiasNaoUteis,
  ProporEventoDoCalendario,
  RevogarEventoDoCalendario,
  RevogarFeriadoLocal,
} from '../application/calendario.js';
import {
  ANA,
  BETO,
  CAIO,
  ESCRITORIO,
  OUTRO_ESCRITORIO,
  PLATAFORMA,
  relogio,
} from '../teste/ficticios.js';

import { EventosGlobaisPostgres, FeriadosLocaisPostgres } from './calendario-postgres.js';

import type { AutorEmAcao } from '../application/calendario.js';
import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS de teste: exercitam o mecanismo, não são feriados reais.
const ana: AutorEmAcao = { ...ANA, canal: 'portal' };
const beto: AutorEmAcao = { ...BETO, canal: 'portal' };
const caio: AutorEmAcao = { ...CAIO, canal: 'portal' };
const dani: AutorEmAcao = {
  tenantId: OUTRO_ESCRITORIO,
  usuarioId: '01a10e00-0000-7000-8000-0000000c0d01' as Uuid,
  canal: 'portal',
};
const entrada = (parcial: Record<string, unknown> = {}) => ({
  abrangencia: 'nacional',
  tipo: 'feriado',
  inicio: '2030-03-10',
  fim: '2030-03-10',
  descricao: 'FICTÍCIO: Dia de Teste',
  atoNormativo: 'FICTÍCIO: Lei de Teste, art. 1º',
  urlAto: 'https://exemplo.invalid/ficticio',
  ...parcial,
});
const comarca = { abrangencia: 'comarca', tribunal: 'TJXA', comarca: 'Alfa' };

let postgres: BancoDeTeste;
let banco: Banco;
let propor: ProporEventoDoCalendario<Transacao>;
let aprovar: AprovarEventoDoCalendario<Transacao>;
let revogar: RevogarEventoDoCalendario<Transacao>;
let cadastrar: CadastrarFeriadoLocal<Transacao>;
let revogarLocal: RevogarFeriadoLocal<Transacao>;
let consultar: ConsultarCalendario<Transacao>;
let dias: ConsultarDiasNaoUteis<Transacao>;

const naPlataforma = <T>(trabalho: () => Promise<T>) => executarNoTenant(PLATAFORMA, trabalho);
const noEscritorio = <T>(trabalho: () => Promise<T>) => executarNoTenant(ESCRITORIO, trabalho);

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  const preparo = new BancoSistema({ url: postgres.url('pz_sistema') });
  await preparo.executarComoSistema('preparar tenants', (tx) =>
    tx.tenant.createMany({
      data: [
        { id: PLATAFORMA, nome: 'PrejuZero (fictício)', tipo: 'plataforma' },
        { id: ESCRITORIO, nome: 'Escritório (fictício)', tipo: 'escritorio' },
        { id: OUTRO_ESCRITORIO, nome: 'Outro escritório (fictício)', tipo: 'escritorio' },
      ],
    }),
  );
  await preparo.encerrar();
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 10 });
  const globais = new EventosGlobaisPostgres();
  const locais = new FeriadosLocaisPostgres();
  const trilha = new TrilhaPostgres();
  const outbox = new OutboxPostgres();
  const r = relogio();
  propor = new ProporEventoDoCalendario(banco, globais, trilha, r);
  aprovar = new AprovarEventoDoCalendario(banco, globais, trilha, outbox, r);
  revogar = new RevogarEventoDoCalendario(banco, globais, trilha, outbox, r);
  cadastrar = new CadastrarFeriadoLocal(banco, locais, trilha, outbox, r);
  revogarLocal = new RevogarFeriadoLocal(banco, locais, trilha, outbox, r);
  consultar = new ConsultarCalendario(banco, globais, locais);
  dias = new ConsultarDiasNaoUteis(banco, globais, locais);
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await postgres.parar();
});

async function aprovado(parcial: Record<string, unknown> = {}) {
  const p = await naPlataforma(() => propor.executar(ana, entrada(parcial)));
  if (!p.ok) throw p.erro;
  const a = await naPlataforma(() => aprovar.executar(beto, p.valor.id));
  if (!a.ok) throw a.erro;
  return a.valor;
}

async function local(autor: AutorEmAcao, parcial: Record<string, unknown> = {}) {
  const r = await executarNoTenant(autor.tenantId, () =>
    cadastrar.executar(autor, entrada({ ...comarca, ...parcial })),
  );
  if (!r.ok) throw r.erro;
  return r.valor;
}

describe('calendário forense no PostgreSQL (HU13)', () => {
  it('global: auditoria e CalendarioAlterado no tenant plataforma, na mesma transação', async () => {
    const evento = await aprovado({ inicio: '2030-01-02', fim: '2030-01-02' });
    const revogacao = await naPlataforma(() =>
      revogar.executar(ana, evento.id, { motivo: 'ato revogado pelo tribunal' }),
    );
    expect(revogacao.ok).toBe(true);
    const [auditoria, eventos] = await naPlataforma(() =>
      banco.executar(async (tx) => [
        await tx.eventoAuditoria.findMany({
          where: { entidadeId: evento.id },
          orderBy: { sequencia: 'asc' },
        }),
        await tx.eventoDominio.findMany({
          where: { agregadoId: evento.id },
          orderBy: { id: 'asc' },
        }),
      ]),
    );
    expect(auditoria.map((a) => [a.tipo, a.usuarioId])).toEqual([
      ['calendario.evento-proposto', ANA.usuarioId],
      ['calendario.evento-aprovado', BETO.usuarioId],
      ['calendario.evento-revogado', ANA.usuarioId],
    ]);
    expect(eventos.map((e) => [e.tipo, e.tenantId])).toEqual([
      ['CalendarioAlterado', PLATAFORMA],
      ['CalendarioAlterado', PLATAFORMA],
    ]);
  });

  it('local: só o próprio escritório vê e revoga (RLS); auditoria e evento no tenant dele', async () => {
    const feriado = await local(caio, { inicio: '2030-04-01', fim: '2030-04-01' });
    const doOutro = await executarNoTenant(OUTRO_ESCRITORIO, () => consultar.locaisListados({}));
    expect(doOutro.map((f) => f.id)).not.toContain(feriado.id);
    const intruso = await executarNoTenant(OUTRO_ESCRITORIO, () =>
      revogarLocal.executar(dani, feriado.id),
    );
    expect(!intruso.ok && intruso.erro.codigo).toBe('evento-inexistente');
    expect((await noEscritorio(() => revogarLocal.executar(caio, feriado.id))).ok).toBe(true);
    const [auditoria, eventos] = await noEscritorio(() =>
      banco.executar(async (tx) => [
        await tx.eventoAuditoria.findMany({ where: { entidadeId: feriado.id } }),
        await tx.eventoDominio.count({ where: { agregadoId: feriado.id, tenantId: ESCRITORIO } }),
      ]),
    );
    expect(auditoria.map((a) => a.tipo)).toEqual([
      'calendario.feriado-local-cadastrado',
      'calendario.feriado-local-revogado',
    ]);
    expect(eventos).toBe(2);
  });

  it('diasNaoUteis: globais vigentes de todos os níveis e locais do tenant, com datas sem fuso', async () => {
    await aprovado({ inicio: '2032-02-28', fim: '2032-03-01', descricao: 'FICTÍCIO: nacional' });
    await aprovado({
      abrangencia: 'tribunal',
      tribunal: 'TJXA',
      inicio: '2032-03-05',
      fim: '2032-03-05',
    });
    await aprovado({
      abrangencia: 'tribunal',
      tribunal: 'TJXB',
      inicio: '2032-03-06',
      fim: '2032-03-06',
    });
    await naPlataforma(() =>
      propor.executar(ana, entrada({ inicio: '2032-03-07', fim: '2032-03-07' })),
    );
    await local(caio, { inicio: '2032-03-08', fim: '2032-03-08' });
    await local(dani, { inicio: '2032-03-09', fim: '2032-03-09' });

    const r = await noEscritorio(() =>
      dias.executar({
        jurisdicao: { tribunal: 'TJXA', comarca: 'Alfa' },
        inicio: '2032-02-01',
        fim: '2032-03-31',
      }),
    );
    if (!r.ok) throw r.erro;
    expect(r.valor.map((d) => [d.data.paraIso(), d.fonte.origem])).toEqual([
      ['2032-02-28', 'global'],
      ['2032-02-29', 'global'],
      ['2032-03-01', 'global'],
      ['2032-03-05', 'global'],
      ['2032-03-08', 'local'],
    ]);
  });

  describe('garantias no banco', () => {
    it('global aprovado não muda de conteúdo nem é apagado, nem pelo dono da tabela', async () => {
      const evento = await aprovado({ inicio: '2033-01-01', fim: '2033-01-01' });
      const migrador = await postgres.conectar('pz_migrator');
      try {
        await expect(
          migrador.query(`UPDATE evento_calendario SET data_fim = '2033-12-31' WHERE id = $1`, [
            evento.id,
          ]),
        ).rejects.toThrow(/só aprovação ou revogação/);
        await expect(
          migrador.query('DELETE FROM evento_calendario WHERE id = $1', [evento.id]),
        ).rejects.toThrow(/só aprovação ou revogação/);
      } finally {
        await migrador.end();
      }
    });

    it('quatro olhos e revogação só de aprovado, também no banco', async () => {
      const p = await naPlataforma(() =>
        propor.executar(ana, entrada({ inicio: '2033-02-01', fim: '2033-02-01' })),
      );
      if (!p.ok) throw p.erro;
      const app = await postgres.conectar('pz_app');
      try {
        await expect(
          app.query(
            `UPDATE evento_calendario SET status = 'aprovado', aprovado_por = proposto_por, aprovado_em = now() WHERE id = $1`,
            [p.valor.id],
          ),
        ).rejects.toThrow(/evento_calendario_aprovacao/);
        await expect(
          app.query(
            `UPDATE evento_calendario SET revogado_por = $2, revogado_em = now(), motivo_revogacao = 'x' WHERE id = $1`,
            [p.valor.id, BETO.usuarioId],
          ),
        ).rejects.toThrow(/evento_calendario_revogacao|só aprovação ou revogação/);
      } finally {
        await app.end();
      }
    });

    it('local: sem tenant não lê, não apaga e só muda pela revogação', async () => {
      const feriado = await local(caio, { inicio: '2033-03-01', fim: '2033-03-01' });
      const app = await postgres.conectar('pz_app');
      try {
        expect((await app.query('SELECT id FROM feriado_local')).rows).toEqual([]);
        await app.query('BEGIN');
        await app.query("SELECT set_config('app.tenant_id', $1, true)", [ESCRITORIO]);
        await expect(
          app.query('UPDATE feriado_local SET descricao = $2 WHERE id = $1', [feriado.id, 'x']),
        ).rejects.toThrow(/só revogação/);
        await app.query('ROLLBACK');
        await expect(
          app.query('DELETE FROM feriado_local WHERE id = $1', [feriado.id]),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await app.end();
      }
    });
  });
});
