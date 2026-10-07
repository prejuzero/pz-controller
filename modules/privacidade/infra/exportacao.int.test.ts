import { TrilhaPostgres } from '@pz/auditoria';
import { ExportacaoDoCadastroPostgres } from '@pz/cadastro';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { ExportacaoDaIdentidadePostgres } from '@pz/identidade';
import { FixedClock, Instant } from '@pz/kernel';
import { ExportacaoDasNotificacoesPostgres } from '@pz/notificacoes';
import { ExportacaoDosTermosPostgres } from '@pz/termos';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GerarExportacao, SolicitarExportacao } from '../application/exportacao.js';

import { ExportacoesPostgres } from './exportacoes-postgres.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { ArmazenamentoArquivos } from '@pz/integracoes';
import type { Uuid } from '@pz/kernel';

// Escritórios, pessoas e processos FICTÍCIOS (CPF gerado, e-mails inválidos).
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const A = '01a10e00-0000-7000-8000-0000000cf001' as Uuid;
const B = '01a10e00-0000-7000-8000-0000000cf002' as Uuid;
const ANA = '01a10e00-0000-7000-8000-0000000cf003' as Uuid;
const BIA = '01a10e00-0000-7000-8000-0000000cf004' as Uuid;

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
const gravados = new Map<string, string>();
const armazenamento = {
  gravar: (a: { caminho: string; conteudo: Uint8Array }) => {
    gravados.set(a.caminho, new TextDecoder().decode(a.conteudo));
    return Promise.resolve();
  },
} as unknown as ArmazenamentoArquivos;
const noTenant = <T>(tenant: Uuid, trabalho: (tx: Transacao) => Promise<T>) =>
  executarNoTenant(tenant, () => banco.executar(trabalho));

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar', async (tx) => {
    await tx.tenant.createMany({
      data: [
        { id: A, nome: 'Escritório A (fictício)', tipo: 'escritorio' },
        { id: B, nome: 'Escritório B (fictício)', tipo: 'escritorio' },
      ],
    });
    await tx.usuario.createMany({
      data: [
        {
          id: ANA,
          tenantId: A,
          nome: 'Ana Fictícia',
          email: 'ana@exemplo.invalid',
          senhaHash: 'HASH-SECRETO',
          totpSegredoCifrado: 'TOTP-SECRETO',
        },
        { id: BIA, tenantId: B, nome: 'Bia Fictícia', email: 'bia@exemplo.invalid' },
      ],
    });
    await tx.advogado.create({
      data: {
        id: '01a10e00-0000-7000-8000-0000000cf005',
        tenantId: A,
        usuarioId: ANA,
        nome: 'Ana Fictícia',
        cpf: '52998224725',
        celular: '11900000000',
      },
    });
    await tx.processo.create({
      data: {
        id: '01a10e00-0000-7000-8000-0000000cf006',
        tenantId: A,
        numeroCnj: '10000040620268260100',
      },
    });
    await tx.processo.create({
      data: {
        id: '01a10e00-0000-7000-8000-0000000cf007',
        tenantId: B,
        numeroCnj: '10000030620268260100',
      },
    });
  });
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 5 });
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

describe('exportação no PostgreSQL com as fontes dos módulos (HU38)', () => {
  it('titular e escritório: dados do próprio tenant, sem segredos', async () => {
    const repo = new ExportacoesPostgres();
    const solicitar = new SolicitarExportacao(
      banco,
      repo,
      new TrilhaPostgres(),
      new OutboxPostgres(),
      relogio,
    );
    const gerar = new GerarExportacao(
      repo,
      [
        new ExportacaoDaIdentidadePostgres(),
        new ExportacaoDoCadastroPostgres(),
        new ExportacaoDosTermosPostgres(),
        new ExportacaoDasNotificacoesPostgres(),
      ],
      armazenamento,
      relogio,
    );
    const solicitante = {
      tenantId: A,
      usuarioId: ANA,
      canal: 'portal' as const,
      podeExportarEscritorio: true,
    };
    for (const escopo of ['titular', 'escritorio'] as const) {
      const pedido = await executarNoTenant(A, () => solicitar.executar(solicitante, { escopo }));
      if (!pedido.ok) throw pedido.erro;
      await noTenant(A, (tx) =>
        gerar.executar(tx, {
          tenantId: A,
          payload: { exportacaoId: pedido.valor.id, usuarioId: ANA, escopo },
        }),
      );
      const json = gravados.get(`privacidade/exportacoes/${pedido.valor.id}/dados.json`) ?? '';
      expect(json).toContain('ana@exemplo.invalid');
      expect(json).not.toMatch(/HASH-SECRETO|TOTP-SECRETO/);
      expect(json).not.toContain('bia@exemplo.invalid');
      expect(json).not.toContain('10000030620268260100');
      if (escopo === 'escritorio') expect(json).toContain('10000040620268260100');
      else expect(json).toContain('52998224725');
    }
    const situacoes = await noTenant(A, (tx) =>
      tx.exportacaoDados.findMany({ select: { situacao: true } }),
    );
    expect(situacoes.map((s) => s.situacao)).toEqual(['concluida', 'concluida']);
  });
});
