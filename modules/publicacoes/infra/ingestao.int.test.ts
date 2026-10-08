import { TrilhaPostgres } from '@pz/auditoria';
import { ObterOuCriarProcesso, ProcessosPostgres } from '@pz/cadastro';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { IngerirCaptura } from '../application/ingestao.js';

import { ExportacaoDasPublicacoesPostgres } from './exportacao-postgres.js';
import { PublicacoesPostgres } from './publicacoes-postgres.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Escritórios e publicações FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const A = gerarUuidV7();
const B = gerarUuidV7();

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
let ingerir: IngerirCaptura<Transacao>;
const oabs: Record<string, Uuid> = {};

const evento = (tenantId: Uuid) => ({
  tenantId,
  payload: {
    alvoId: gerarUuidV7(),
    tipo: 'oab',
    valor: '123456/SP',
    referencias: [oabs[tenantId]],
    janela: { inicio: '2026-10-01', fim: '2026-10-07' },
    fonte: 'djen',
    publicacoes: [
      {
        idExterno: '900000001',
        hashConteudo: 'e'.repeat(64),
        dataDisponibilizacao: '2026-10-06',
        teor: 'FICTÍCIO: intimação para manifestação.',
        numeroCnj: '1000004-06.2026.8.26.0100',
        urlFonte: 'https://exemplo.invalid/certidao',
        metadados: { siglaTribunal: 'TJSP' },
      },
    ],
  },
});

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar', async (tx) => {
    for (const [n, tenant] of [A, B].entries()) {
      await tx.tenant.create({
        data: { id: tenant, nome: `E${String(n)} (fictício)`, tipo: 'escritorio' },
      });
      const usuario = gerarUuidV7();
      await tx.usuario.create({
        data: {
          id: usuario,
          tenantId: tenant,
          nome: 'Fictícia',
          email: `f${String(n)}@exemplo.invalid`,
        },
      });
      const advogado = gerarUuidV7();
      await tx.advogado.create({
        data: {
          id: advogado,
          tenantId: tenant,
          usuarioId: usuario,
          nome: 'Fictícia',
          cpf: n === 0 ? '52998224725' : '11144477735',
          celular: '11900000000',
        },
      });
      oabs[tenant] = gerarUuidV7();
      await tx.oab.create({
        data: {
          id: oabs[tenant],
          tenantId: tenant,
          advogadoId: advogado,
          numero: `12345${String(n)}`,
          uf: 'SP',
          tipo: 'principal',
        },
      });
    }
  });
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 10 });
  const noTenant = {
    executar: <T>(tenant: Uuid, trabalho: (tx: Transacao) => Promise<T>) =>
      executarNoTenant(tenant, () => banco.executar(trabalho)),
  };
  const obterOuCriar = new ObterOuCriarProcesso(
    noTenant,
    new ProcessosPostgres(relogio),
    new TrilhaPostgres(),
    new OutboxPostgres(),
    relogio,
  );
  ingerir = new IngerirCaptura(
    new PublicacoesPostgres(),
    async (tenant, numero) => {
      const r = await obterOuCriar.executar(tenant, numero);
      if (!r.ok) throw r.erro;
      return r.valor.processoId;
    },
    new OutboxPostgres(),
    relogio,
    (fonte) => `${fonte}@1.0.0`,
  );
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

describe('ingestão no PostgreSQL (HU18)', () => {
  it('o mesmo conteúdo em dois escritórios: um registro global, um destinatário e um processo em cada', async () => {
    const consumir = (tenant: Uuid) =>
      executarNoTenant(tenant, () => banco.executar((tx) => ingerir.executar(tx, evento(tenant))));
    expect(await consumir(A)).toEqual({ novas: 1, recebidas: 1 });
    expect(await consumir(B)).toEqual({ novas: 0, recebidas: 1 });
    expect(await consumir(A)).toEqual({ novas: 0, recebidas: 0 });

    await sistema.executarComoSistema('conferir', async (tx) => {
      expect(await tx.publicacaoConteudo.count()).toBe(1);
      expect(await tx.publicacaoDestinatario.count()).toBe(2);
      expect(await tx.processo.count({ where: { numeroCnj: '10000040620268260100' } })).toBe(2);
      const eventos = await tx.eventoDominio.findMany({
        where: { tipo: { in: ['PublicacaoNova', 'PublicacaoRecebida'] } },
        select: { tipo: true, tenantId: true },
      });
      expect(eventos.filter((e) => e.tipo === 'PublicacaoNova')).toHaveLength(1);
      expect(
        eventos
          .filter((e) => e.tipo === 'PublicacaoRecebida')
          .map((e) => e.tenantId)
          .sort(),
      ).toEqual([A, B].sort());
    });

    const [secao] = await executarNoTenant(A, () =>
      banco.executar((tx) => new ExportacaoDasPublicacoesPostgres().escritorio(tx)),
    );
    expect(secao?.linhas).toEqual([
      expect.objectContaining({ numeroCnj: '10000040620268260100', fonte: 'djen' }),
    ]);
  });
});
