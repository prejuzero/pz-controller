import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  EnviarNotificacao,
  Notificar,
  RegistrarDesfechosDeEntrega,
} from '../application/notificacoes.js';

import {
  NotificacoesPostgres,
  PreferenciasPostgres,
  SupressaoPostgres,
} from './notificacoes-postgres.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const TENANT = gerarUuidV7();
const OUTRO = gerarUuidV7();
const USUARIO = gerarUuidV7();
let postgres: BancoDeTeste;
let banco: Banco;
let notificar: Notificar<Transacao>;
let enviar: EnviarNotificacao<Transacao>;
let sistemaDosWebhooks: BancoSistema;
const enviados: string[] = [];

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  const sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar o teste', async (tx) => {
    await tx.tenant.createMany({
      data: [
        { id: TENANT, nome: 'Escritório (fictício)', tipo: 'escritorio' },
        { id: OUTRO, nome: 'Outro (fictício)', tipo: 'escritorio' },
      ],
    });
    await tx.supressao.create({ data: { email: 'rejeitou@exemplo.invalid', motivo: 'bounce' } });
  });
  sistemaDosWebhooks = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.encerrar();
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 5 });
  const repositorio = new NotificacoesPostgres();
  notificar = new Notificar(
    repositorio,
    new PreferenciasPostgres(),
    {
      emails: () =>
        Promise.resolve({ principal: 'ana@exemplo.invalid', copias: ['rejeitou@exemplo.invalid'] }),
    },
    new SupressaoPostgres(),
    new OutboxPostgres(),
    relogio,
  );
  enviar = new EnviarNotificacao(
    repositorio,
    {
      email: {
        enviar: ({ idempotencia }) => {
          enviados.push(idempotencia);
          return Promise.resolve({ idExterno: `ext-${idempotencia}`, aceitoEm: relogio.agora() });
        },
      },
    },
    relogio,
  );
}, 120_000);

afterAll(async () => {
  await sistemaDosWebhooks.encerrar();
  await banco.encerrar();
  await postgres.parar();
});

const pedido = {
  tipo: 'lembrete-prazo',
  tenantId: TENANT,
  usuarioId: USUARIO,
  janela: '2026-10-07',
  dados: { numeroProcesso: '1', vencimento: '15/10/2026', link: 'https://app.exemplo.invalid/x' },
};
const noTenant = <T>(tenant: Uuid, trabalho: (tx: Transacao) => Promise<T>) =>
  executarNoTenant(tenant, () => banco.executar(trabalho));

describe('notificações no PostgreSQL (HU30)', () => {
  it('chave única, supressão global, envio uma vez e RLS', async () => {
    const r = await noTenant(TENANT, (tx) => notificar.executar(tx, pedido));
    if (!r.ok || !r.valor.solicitada) throw new Error('não solicitada');
    const repetido = await noTenant(TENANT, (tx) => notificar.executar(tx, pedido));
    expect(repetido.ok && repetido.valor).toEqual({ solicitada: false, motivo: 'ja-solicitada' });

    const id = r.valor.notificacaoId;
    await noTenant(TENANT, (tx) => enviar.executar(tx, id));
    await noTenant(TENANT, (tx) => enviar.executar(tx, id));
    expect(enviados).toHaveLength(1);

    const gravada = await noTenant(TENANT, (tx) =>
      tx.notificacao.findUniqueOrThrow({ where: { id } }),
    );
    expect(gravada.destinatarios).toEqual(['ana@exemplo.invalid']);
    expect(gravada.enviadaEm).not.toBeNull();
    const evento = await noTenant(TENANT, (tx) =>
      tx.eventoDominio.findMany({ where: { tipo: 'NotificacaoSolicitada' } }),
    );
    expect(evento).toHaveLength(1);
    // Outro tenant não vê a notificação.
    expect(await noTenant(OUTRO, (tx) => tx.notificacao.count())).toBe(0);
  });

  it('preferência desativada e notificação sem DELETE', async () => {
    await noTenant(TENANT, (tx) =>
      tx.preferenciaNotificacao.create({
        data: {
          tenantId: TENANT,
          usuarioId: USUARIO,
          tipo: 'lembrete-prazo',
          canal: 'email',
          ativo: false,
        },
      }),
    );
    const r = await noTenant(TENANT, (tx) =>
      notificar.executar(tx, { ...pedido, janela: '2026-10-08' }),
    );
    expect(r.ok && r.valor).toEqual({ solicitada: false, motivo: 'desativada' });
    await expect(noTenant(TENANT, (tx) => tx.notificacao.deleteMany({}))).rejects.toThrow();
  });

  it('desfecho pelo webhook (transação global): supressão, rejeição e evento no tenant', async () => {
    const desfechos = new RegistrarDesfechosDeEntrega(
      new NotificacoesPostgres(),
      new SupressaoPostgres(),
      new OutboxPostgres(),
      relogio,
    );
    const idExterno = `ext-lembrete-prazo:-:${USUARIO}:email:2026-10-07`;
    const em = Instant.deIso('2026-10-07T12:05:00Z');
    const aplicar = () =>
      sistemaDosWebhooks.executarComoSistema('webhook de teste', (tx) =>
        desfechos.executar(tx, [
          { idExterno, tipo: 'entregue', ocorridoEm: em },
          {
            idExterno,
            tipo: 'rejeitado',
            ocorridoEm: em,
            motivo: 'Permanent/General',
            destinatarios: ['Ana@Exemplo.invalid'],
          },
        ]),
      );
    expect(await aplicar()).toEqual({ rejeicoes: ['bounce'], semNotificacao: 0 });
    expect(await aplicar()).toEqual({ rejeicoes: [], semNotificacao: 0 });

    const gravada = await noTenant(TENANT, (tx) =>
      tx.notificacao.findUniqueOrThrow({ where: { idExterno } }),
    );
    expect(gravada.entregueEm?.toISOString()).toBe('2026-10-07T12:05:00.000Z');
    expect(gravada.motivoRejeicao).toBe('bounce: Permanent/General');
    const eventos = await noTenant(TENANT, (tx) =>
      tx.eventoDominio.findMany({
        where: { tipo: { in: ['NotificacaoEntregue', 'NotificacaoRejeitada'] } },
      }),
    );
    expect(eventos.map((e) => e.tipo).sort()).toEqual([
      'NotificacaoEntregue',
      'NotificacaoRejeitada',
    ]);
    const r = await noTenant(TENANT, (tx) =>
      notificar.executar(tx, {
        ...pedido,
        tipo: 'nova-intimacao',
        dados: { numeroProcesso: '1', link: 'https://app.exemplo.invalid/x' },
      }),
    );
    // Os dois endereços estão suprimidos agora (rejeitou antes; ana pelo bounce).
    expect(r.ok && r.valor).toEqual({ solicitada: false, motivo: 'sem-destinatario' });
  });
});
