import { Banco, BancoSistema, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { SystemClock } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { VerificarIntegridade } from '../application/integridade.js';
import { verificarCadeia } from '../domain/cadeia.js';

import { CadeiaPostgres } from './cadeia-postgres.js';
import { sha256, TrilhaPostgres } from './trilha-postgres.js';

import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Dados fictícios de teste.
const TENANT_A = '01a10e00-0000-7000-8000-0000000a0d01' as Uuid;
const TENANT_B = '01a10e00-0000-7000-8000-0000000a0d02' as Uuid;
const TENANT_C = '01a10e00-0000-7000-8000-0000000a0d03' as Uuid;
const trilha = new TrilhaPostgres();
const entrada = (n: number) => ({
  tipo: 'identidade.conta-bloqueada' as const,
  entidade: 'usuario',
  entidadeId: `u-${String(n)}`,
  depois: { n },
});

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  const preparo = new BancoSistema({ url: postgres.url('pz_sistema') });
  await preparo.executarComoSistema('preparar tenants', (tx) =>
    tx.tenant.createMany({
      data: [
        { id: TENANT_A, nome: 'A', tipo: 'escritorio' },
        { id: TENANT_B, nome: 'B', tipo: 'escritorio' },
        { id: TENANT_C, nome: 'C', tipo: 'escritorio' },
      ],
    }),
  );
  await preparo.encerrar();
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 20 });
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
}, 300_000);

afterAll(async () => {
  await Promise.all([banco.encerrar(), sistema.encerrar()]);
  await postgres.parar();
});

const ler = (tenant: Uuid) =>
  executarNoTenant(tenant, () => banco.executar((tx) => trilha.lerCadeia(tx, tenant)));

describe('trilha de auditoria no PostgreSQL (HU08)', () => {
  it('1.000 registros concorrentes no mesmo tenant: sequência sem buracos e cadeia válida', async () => {
    // 50 transações disputando a trava ao mesmo tempo, em 20 ondas (o pool do Prisma tem 20 conexões).
    for (let onda = 0; onda < 20; onda++) {
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          executarNoTenant(TENANT_A, () =>
            banco.executar((tx) =>
              trilha.registrar(tx, entrada(onda * 50 + i), { canal: 'sistema' }),
            ),
          ),
        ),
      );
    }
    const cadeia = await ler(TENANT_A);
    expect(cadeia.map((r) => r.sequencia)).toEqual(Array.from({ length: 1_000 }, (_, i) => i + 1));
    expect(verificarCadeia(cadeia, sha256)).toMatchObject({
      valida: true,
      ultimo: { sequencia: 1_000 },
    });
  }, 120_000);

  it('cada tenant tem a própria cadeia, invisível ao outro; horário do banco', async () => {
    await executarNoTenant(TENANT_B, () =>
      banco.executar((tx) =>
        trilha.registrar(tx, entrada(1), { canal: 'portal', ip: '203.0.113.1' }),
      ),
    );
    const b = await ler(TENANT_B);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({
      sequencia: 1,
      hashAnterior: '0'.repeat(64),
      canal: 'portal',
      ip: '203.0.113.1',
    });
    expect(Math.abs(Date.parse(String(b[0]?.criadoEm)) - Date.now())).toBeLessThan(60_000);
    expect((await ler(TENANT_A)).every((r) => r.tenantId === TENANT_A)).toBe(true);
  });

  it('falha no registro derruba a transação de negócio; sem tenant não registra', async () => {
    await expect(
      executarNoTenant(TENANT_B, () =>
        banco.executar(async (tx) => {
          await tx.tenant.update({ where: { id: TENANT_B }, data: { nome: 'alterado' } });
          await trilha.registrar(
            tx,
            { ...entrada(2), tipo: 'inexistente' as never },
            { canal: 'sistema' },
          );
        }),
      ),
    ).rejects.toThrow();
    const sistema = await postgres.conectar('pz_sistema');
    expect(
      (await sistema.query('SELECT nome FROM tenant WHERE id = $1', [TENANT_B])).rows[0],
    ).toEqual({ nome: 'B' });
    await sistema.end();
    await expect(
      banco.executarSemTenant('teste', (tx) =>
        trilha.registrar(tx, entrada(3), { canal: 'sistema' }),
      ),
    ).rejects.toThrow('tenant');
  });

  it('nem o superusuário altera (trigger); adulteração com o trigger desligado é detectada', async () => {
    const superusuario = await postgres.conectar('pz_dev');
    await expect(superusuario.query("UPDATE evento_auditoria SET canal = 'x'")).rejects.toThrow(
      /imutável/,
    );
    await expect(superusuario.query('DELETE FROM evento_auditoria')).rejects.toThrow(/imutável/);
    await superusuario.query(
      'ALTER TABLE evento_auditoria DISABLE TRIGGER evento_auditoria_imutavel',
    );
    await superusuario.query(
      'UPDATE evento_auditoria SET depois = \'{"n": -1}\' WHERE tenant_id = $1 AND sequencia = 500',
      [TENANT_A],
    );
    await superusuario.query(
      'ALTER TABLE evento_auditoria ENABLE TRIGGER evento_auditoria_imutavel',
    );
    await superusuario.end();
    expect(verificarCadeia(await ler(TENANT_A), sha256)).toEqual({
      valida: false,
      sequencia: 500,
      motivo: 'conteúdo alterado (hash não confere)',
    });
  });

  it('as partições não são acessíveis diretamente pela aplicação (só pela tabela-mãe, com RLS)', async () => {
    const migrador = await postgres.conectar('pz_migrator');
    const { rows } = await migrador.query<{ particao: string }>(
      "SELECT c.relname AS particao FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'evento_auditoria'::regclass LIMIT 1",
    );
    await migrador.end();
    const particao = String(rows[0]?.particao);
    for (const papel of ['pz_app', 'pz_sistema', 'pz_leitura'] as const) {
      const cliente = await postgres.conectar(papel);
      await expect(cliente.query(`SELECT 1 FROM ${particao}`), papel).rejects.toThrow(
        /permission denied/,
      );
      await cliente.end();
    }
  });
});

describe('verificador diário com PostgreSQL real (PZ-110)', () => {
  it('exporta só o que é novo, detecta adulteração e registros apagados do fim', async () => {
    for (let n = 0; n < 4; n++) {
      await executarNoTenant(TENANT_C, () =>
        banco.executar((tx) => trilha.registrar(tx, entrada(n), { canal: 'sistema' })),
      );
    }
    const gravados: { tenantId: string; caminho: string; linhas: number }[] = [];
    const worm = {
      gravar: (tenantId: string, caminho: string, conteudo: Uint8Array) => {
        gravados.push({
          tenantId,
          caminho,
          linhas: new TextDecoder().decode(conteudo).trim().split('\n').length,
        });
        return Promise.resolve();
      },
    };
    const verificar = new VerificarIntegridade(
      sistema.unidade('verificação da auditoria (teste)'),
      new CadeiaPostgres(),
      worm,
      sha256,
      { agora: () => new SystemClock().agora() },
    );
    const doTenant = async () => (await verificar.executar()).find((r) => r.tenantId === TENANT_C);

    expect(await doTenant()).toEqual({ tenantId: TENANT_C, situacao: 'integra', exportados: 4 });
    expect(gravados.find((g) => g.tenantId === TENANT_C)).toMatchObject({
      linhas: 4,
      caminho: expect.stringMatching(/^auditoria\/\d{4}\/\d{2}\/\d{2}\/1-4\.ndjson$/) as unknown,
    });
    expect(await doTenant()).toEqual({ tenantId: TENANT_C, situacao: 'integra', exportados: 0 }); // incremental

    const superusuario = await postgres.conectar('pz_dev');
    await superusuario.query(
      'ALTER TABLE evento_auditoria DISABLE TRIGGER evento_auditoria_imutavel',
    );
    await superusuario.query(
      'DELETE FROM evento_auditoria WHERE tenant_id = $1 AND sequencia = 4',
      [TENANT_C],
    );
    await superusuario.query(
      'ALTER TABLE evento_auditoria ENABLE TRIGGER evento_auditoria_imutavel',
    );
    await superusuario.end();
    expect(await doTenant()).toMatchObject({
      situacao: 'divergente',
      sequencia: 4,
      motivo: expect.stringContaining('removidos do fim') as unknown,
    });

    // O tenant A foi adulterado no teste anterior (sequência 500): o verificador também acusa.
    expect((await verificar.executar()).find((r) => r.tenantId === TENANT_A)).toMatchObject({
      situacao: 'divergente',
      sequencia: 500,
    });
  }, 120_000);
});
