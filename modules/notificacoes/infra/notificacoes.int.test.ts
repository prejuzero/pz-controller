import { TrilhaPostgres } from '@pz/auditoria';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ConcederConsentimento,
  RegistrarDestinoPush,
  RevogarConsentimento,
} from '../application/consentimentos.js';
import {
  EnviarNotificacao,
  Notificar,
  RegistrarDesfechosDeEntrega,
} from '../application/notificacoes.js';
import { ListarSupressoes } from '../application/supressoes.js';

import { ConsentimentosPostgres, DestinosPushPostgres } from './consentimentos-postgres.js';
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
    new ConsentimentosPostgres(),
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

  it('lista as supressões globais em ordem de e-mail (HU39)', async () => {
    const lista = await noTenant(OUTRO, (tx) => new SupressaoPostgres().listar(tx, { limite: 10 }));
    expect(lista).toContainEqual(
      expect.objectContaining({ email: 'rejeitou@exemplo.invalid', motivo: 'bounce' }),
    );
    const apos = await noTenant(OUTRO, (tx) =>
      new SupressaoPostgres().listar(tx, { limite: 10, apos: 'rejeitou@exemplo.invalid' }),
    );
    expect(apos.every((s) => s.email > 'rejeitou@exemplo.invalid')).toBe(true);
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
    // QA da HU39 (PZ-230): a rejeição aparece na lista do administrador, lida de outro tenant.
    const painel = await new ListarSupressoes(
      { executar: <T>(trabalho: (tx: Transacao) => Promise<T>) => noTenant(OUTRO, trabalho) },
      new SupressaoPostgres(),
    ).executar({ limite: 100 });
    expect(painel.itens).toContainEqual(
      expect.objectContaining({ email: 'ana@exemplo.invalid', motivo: 'bounce' }),
    );
    const r = await noTenant(TENANT, (tx) =>
      notificar.executar(tx, {
        ...pedido,
        tipo: 'nova-intimacao',
        dados: { numeroProcesso: '1', link: 'https://app.exemplo.invalid/x' },
      }),
    );
    // Os dois endereços estão suprimidos agora (rejeitou antes; ana pelo bounce).
    expect(r.ok && r.valor).toEqual({ solicitada: false, motivo: 'sem-destinatario' });

    // Aviso à equipe: só o tenant da rejeição a enxerga (RLS).
    const repositorio = new NotificacoesPostgres();
    const desde = Instant.deIso('2026-10-01T00:00:00Z');
    expect(await noTenant(TENANT, (tx) => repositorio.usuariosComRejeicaoDesde(tx, desde))).toBe(1);
    expect(await noTenant(OUTRO, (tx) => repositorio.usuariosComRejeicaoDesde(tx, desde))).toBe(0);
  });

  it('push só para dispositivo consentido; revogação, RLS, trilha e consentimento sem DELETE', async () => {
    const unidade = { executar: <T>(t: (tx: Transacao) => Promise<T>) => noTenant(TENANT, t) };
    const consentimentos = new ConsentimentosPostgres();
    const trilha = new TrilhaPostgres();
    const DISPOSITIVO = gerarUuidV7();
    const autor = {
      tenantId: TENANT,
      usuarioId: USUARIO,
      origem: 'app' as const,
      dispositivoId: DISPOSITIVO,
    };
    const registrar = new RegistrarDestinoPush(
      unidade,
      new DestinosPushPostgres(),
      trilha,
      relogio,
    );
    expect((await registrar.executar(autor, { plataforma: 'android', token: 'token-1' })).ok).toBe(
      true,
    );
    expect((await registrar.executar(autor, { plataforma: 'android', token: 'token-2' })).ok).toBe(
      true,
    );

    const pedirPush = (janela: string) =>
      noTenant(TENANT, (tx) => notificar.executar(tx, { ...pedido, janela }, 'push'));
    const sem = await pedirPush('2026-10-09');
    expect(sem.ok && sem.valor).toEqual({ solicitada: false, motivo: 'sem-destinatario' });

    const conceder = new ConcederConsentimento(
      unidade,
      consentimentos,
      trilha,
      new OutboxPostgres(),
      relogio,
    );
    const c = await conceder.executar(autor, { canal: 'push', destino: DISPOSITIVO });
    if (!c.ok) throw c.erro;
    const repetido = await conceder.executar(autor, { canal: 'push', destino: DISPOSITIVO });
    expect(repetido.ok && repetido.valor.id).toBe(c.valor.id);
    const r = await pedirPush('2026-10-10');
    if (!r.ok || !r.valor.solicitada) throw new Error('não solicitada');
    const notificacaoId = r.valor.notificacaoId;
    const gravada = await noTenant(TENANT, (tx) =>
      tx.notificacao.findUniqueOrThrow({ where: { id: notificacaoId } }),
    );
    expect(gravada.destinatarios).toEqual(['token-2']);

    const revogar = new RevogarConsentimento(
      unidade,
      consentimentos,
      trilha,
      new OutboxPostgres(),
      relogio,
    );
    expect((await revogar.executar(autor, c.valor.id)).ok).toBe(true);
    expect(await noTenant(TENANT, (tx) => consentimentos.enderecos(tx, USUARIO, 'push'))).toEqual(
      [],
    );
    expect(await noTenant(OUTRO, (tx) => tx.consentimentoCanal.count())).toBe(0);
    expect(await noTenant(OUTRO, (tx) => tx.destinoPush.count())).toBe(0);
    await expect(noTenant(TENANT, (tx) => tx.consentimentoCanal.deleteMany({}))).rejects.toThrow();
    const registros = await noTenant(TENANT, (tx) =>
      tx.eventoAuditoria.findMany({
        where: { tipo: { startsWith: 'notificacoes.' } },
        select: { tipo: true, depois: true },
      }),
    );
    expect(registros.map((e) => e.tipo).sort()).toEqual([
      'notificacoes.consentimento-concedido',
      'notificacoes.consentimento-revogado',
      'notificacoes.destino-push-registrado',
      'notificacoes.destino-push-registrado',
    ]);
    expect(JSON.stringify(registros)).not.toContain('token-');
    const eventos = await noTenant(TENANT, (tx) =>
      tx.eventoDominio.count({ where: { tipo: 'ConsentimentoCanalAlterado' } }),
    );
    expect(eventos).toBe(2);
  });
});
