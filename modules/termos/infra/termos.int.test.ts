import { TrilhaPostgres } from '@pz/auditoria';
import { Banco, BancoSistema, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AceitarDocumento,
  ConsultarTermosPendentes,
  PublicarDocumentoLegal,
} from '../application/termos.js';

import { AceitesPostgres, DocumentosPostgres } from './termos-postgres.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Documentos e usuários FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const ESCRITORIO = '01a10e00-0000-7000-8000-0000000ce001' as Uuid;
const OUTRO = '01a10e00-0000-7000-8000-0000000ce002' as Uuid;
const USUARIO = '01a10e00-0000-7000-8000-0000000ce003' as Uuid;
const DOCUMENTO = '01a10e00-0000-7000-8000-0000000ce004' as Uuid;

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
let aceitar: AceitarDocumento<Transacao>;
let consultar: ConsultarTermosPendentes<Transacao>;
const noTenant = {
  executar: <T>(tenant: Uuid, trabalho: (tx: Transacao) => Promise<T>) =>
    executarNoTenant(tenant, () => banco.executar(trabalho)),
};
const sessao = (tenantId: Uuid) => ({
  tenantId,
  usuarioId: USUARIO,
  sessaoIniciadaEm: relogio.agora(),
  canal: 'portal' as const,
});

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar', async (tx) => {
    await tx.tenant.createMany({
      data: [
        { id: ESCRITORIO, nome: 'Escritório (fictício)', tipo: 'escritorio' },
        { id: OUTRO, nome: 'Outro (fictício)', tipo: 'escritorio' },
      ],
    });
    await tx.documentoLegal.create({
      data: {
        id: DOCUMENTO,
        tipo: 'termos',
        versao: '1.0',
        conteudo: 'FICTÍCIO',
        publicadoEm: new Date('2026-10-01T00:00:00Z'),
      },
    });
  });
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 5 });
  const documentos = new DocumentosPostgres();
  const aceites = new AceitesPostgres();
  aceitar = new AceitarDocumento(noTenant, documentos, aceites, new TrilhaPostgres(), relogio);
  consultar = new ConsultarTermosPendentes(noTenant, documentos, aceites);
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

describe('termos no PostgreSQL (HU38)', () => {
  it('aceite grava prova e trilha na mesma transação; o aceite é por tenant (RLS)', async () => {
    expect(await consultar.executar(sessao(ESCRITORIO))).toHaveLength(1);
    const r = await aceitar.executar(sessao(ESCRITORIO), DOCUMENTO, {
      ip: '203.0.113.10',
      userAgent: 'Navegador FICTÍCIO',
    });
    expect(r.ok).toBe(true);
    expect(await consultar.executar(sessao(ESCRITORIO))).toEqual([]);
    expect(await consultar.executar(sessao(OUTRO))).toHaveLength(1);
    const trilha = await sistema.executarComoSistema('conferir', (tx) =>
      tx.eventoAuditoria.findMany({ where: { tipo: 'termos.documento-aceito' } }),
    );
    expect(trilha.map((t) => t.tenantId)).toEqual([ESCRITORIO]);
  });

  it('a aplicação não altera nem apaga aceite nem documento publicado (imutáveis)', async () => {
    await expect(
      noTenant.executar(ESCRITORIO, (tx) => tx.aceiteDocumento.deleteMany({})),
    ).rejects.toThrow(/permission denied/);
    await expect(
      noTenant.executar(ESCRITORIO, (tx) => tx.aceiteDocumento.updateMany({ data: { ip: 'x' } })),
    ).rejects.toThrow(/permission denied/);
    await expect(
      noTenant.executar(ESCRITORIO, (tx) =>
        tx.documentoLegal.updateMany({ data: { conteudo: 'alterado' } }),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      noTenant.executar(ESCRITORIO, (tx) => tx.documentoLegal.deleteMany({})),
    ).rejects.toThrow(/permission denied/);
  });

  it('publicação (PZ-303): versão nova gravada com trilha na mesma transação; repetida não', async () => {
    const publicar = new PublicarDocumentoLegal(
      noTenant,
      new DocumentosPostgres(),
      new TrilhaPostgres(),
      relogio,
    );
    const publicador = { tenantId: ESCRITORIO, usuarioId: USUARIO, canal: 'portal' as const };
    const pedido = { tipo: 'termos' as const, versao: '1.1', conteudo: 'Texto FICTÍCIO 1.1' };
    const r = await publicar.executar(publicador, pedido);
    if (!r.ok) throw new Error('deveria publicar');
    expect((await publicar.executar(publicador, pedido)).ok).toBe(false);
    const trilha = await noTenant.executar(ESCRITORIO, (tx) =>
      tx.eventoAuditoria.findMany({ where: { tipo: 'termos.documento-publicado' } }),
    );
    expect(trilha.map((e) => e.entidadeId)).toEqual([r.valor.id]);
    // A versão nova passa a ser exigida de quem iniciar sessão depois dela.
    const pendentes = await consultar.executar({
      ...sessao(OUTRO),
      sessaoIniciadaEm: relogio.agora(),
    });
    expect(pendentes.map((d) => d.versao)).toEqual(['1.1']);
  });
});
