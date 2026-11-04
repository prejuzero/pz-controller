import { Banco, BancoSistema, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ConsultarHistorico,
  EmitirHistoricoVerificavel,
  VerificarHistorico,
} from '../application/historico.js';

import { HistoricoPostgres } from './historico-postgres.js';
import { sha256, TrilhaPostgres } from './trilha-postgres.js';

import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Dados fictícios de teste.
const TENANT_A = '01a10e00-0000-7000-8000-0000000a0e01' as Uuid;
const TENANT_B = '01a10e00-0000-7000-8000-0000000a0e02' as Uuid;
const PRAZO = '01a10e00-0000-7000-8000-00000000f001';
const NOTIFICACAO = '01a10e00-0000-7000-8000-00000000f002';
const trilha = new TrilhaPostgres();
const repositorio = new HistoricoPostgres();
const PRINCIPAL = { entidade: 'prazo', entidadeId: PRAZO };
const alvos = [PRINCIPAL, { entidade: 'notificacao', entidadeId: NOTIFICACAO }];

let postgres: BancoDeTeste;
let banco: Banco;

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  const preparo = new BancoSistema({ url: postgres.url('pz_sistema') });
  await preparo.executarComoSistema('preparar tenants', (tx) =>
    tx.tenant.createMany({
      data: [
        { id: TENANT_A, nome: 'A', tipo: 'escritorio' },
        { id: TENANT_B, nome: 'B', tipo: 'escritorio' },
      ],
    }),
  );
  await preparo.encerrar();
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 5 });
  // Ciclo de vida fictício: prazo sugerido, notificado e confirmado; um evento de outra entidade.
  await executarNoTenant(TENANT_A, () =>
    banco.executar(async (tx) => {
      const canal = { canal: 'sistema' as const };
      await trilha.registrar(
        tx,
        {
          tipo: 'prazos.prazo-sugerido',
          entidade: 'prazo',
          entidadeId: PRAZO,
          depois: { status: 'a-confirmar' },
        },
        canal,
      );
      await trilha.registrar(
        tx,
        {
          tipo: 'notificacoes.notificacao-rejeitada',
          entidade: 'notificacao',
          entidadeId: NOTIFICACAO,
        },
        canal,
      );
      await trilha.registrar(
        tx,
        { tipo: 'cadastro.perfil-atualizado', entidade: 'advogado', entidadeId: 'a-1' },
        canal,
      );
      await trilha.registrar(
        tx,
        {
          tipo: 'prazos.prazo-confirmado',
          entidade: 'prazo',
          entidadeId: PRAZO,
          antes: { status: 'a-confirmar' },
          depois: { status: 'confirmado' },
        },
        canal,
      );
    }),
  );
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await postgres.parar();
});

const noTenant = <T>(tenantId: string, trabalho: () => Promise<T>) =>
  executarNoTenant(tenantId as Uuid, trabalho);

describe('histórico verificável do prazo no PostgreSQL (HU35)', () => {
  it('traz os eventos do prazo e das notificações, em ordem da cadeia', async () => {
    const eventos = await noTenant(TENANT_A, () =>
      new ConsultarHistorico(banco, repositorio).executar(TENANT_A, alvos),
    );
    expect(eventos.map((e) => e.tipo)).toEqual([
      'prazos.prazo-sugerido',
      'notificacoes.notificacao-rejeitada',
      'prazos.prazo-confirmado',
    ]);
    expect(eventos[2]?.hashAnterior).not.toBe(eventos[1]?.hash); // houve um evento no meio
  });

  it('outro tenant não vê o histórico (RLS)', async () => {
    const eventos = await noTenant(TENANT_B, () =>
      new ConsultarHistorico(banco, repositorio).executar(TENANT_A, alvos),
    );
    expect(eventos).toEqual([]);
  });

  it('PDF emitido verifica; código trocado é inexistente; registro adulterado diverge', async () => {
    const emitir = new EmitirHistoricoVerificavel(banco, repositorio, sha256);
    const verificar = new VerificarHistorico(noTenant, banco, repositorio, sha256);
    const { codigo, eventos } = await noTenant(TENANT_A, () =>
      emitir.executar(TENANT_A, PRINCIPAL, alvos),
    );
    expect(eventos).toHaveLength(3);
    // Emitir de novo o mesmo trecho dá o mesmo código (sem gravar duas vezes).
    await expect(
      noTenant(TENANT_A, () => emitir.executar(TENANT_A, PRINCIPAL, alvos)),
    ).resolves.toMatchObject({ codigo });

    await expect(verificar.executar(codigo)).resolves.toMatchObject({ situacao: 'valido' });
    const trocado = `${codigo.slice(0, -1)}${codigo.endsWith('0') ? '1' : '0'}`;
    await expect(verificar.executar(trocado)).resolves.toEqual({ situacao: 'inexistente' });
    await expect(verificar.executar('nao-e-codigo')).resolves.toEqual({ situacao: 'inexistente' });

    const superusuario = await postgres.conectar('pz_dev');
    await superusuario.query(
      'ALTER TABLE evento_auditoria DISABLE TRIGGER evento_auditoria_imutavel',
    );
    await superusuario.query(
      `UPDATE evento_auditoria SET depois = '{"status": "cancelado"}' WHERE tenant_id = $1 AND sequencia = $2`,
      [TENANT_A, eventos[2]?.sequencia],
    );
    await superusuario.query(
      'ALTER TABLE evento_auditoria ENABLE TRIGGER evento_auditoria_imutavel',
    );
    await superusuario.end();
    await expect(verificar.executar(codigo)).resolves.toEqual({
      situacao: 'divergente',
      motivo: `registro ${String(eventos[2]?.sequencia)} alterado (hash não confere)`,
    });
  });
});
