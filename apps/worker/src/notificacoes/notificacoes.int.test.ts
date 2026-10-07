import { createSign, generateKeyPairSync } from 'node:crypto';

import { WebhooksSes } from '@pz/adapter-ses';
import { carregarAmbiente } from '@pz/config/env';
import { Banco, executarNoTenant, OutboxPostgres, WebhooksPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { EmailsDosUsuariosPostgres } from '@pz/identidade';
import { gerarUuidV7, SystemClock } from '@pz/kernel';
import {
  ConsultarAvisosDeEntrega,
  Notificar,
  NotificacoesPostgres,
  PreferenciasPostgres,
  RegistrarDesfechosDeEntrega,
  SupressaoPostgres,
  ConsentimentosPostgres,
} from '@pz/notificacoes';
import { RedisContainer } from '@testcontainers/redis';
import { GenericContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaWorker } from '../ambiente.js';
import { criarWorker } from '../worker.js';

import { processadorDeEntregas } from './entregas.js';

import type { INestApplicationContext } from '@nestjs/common';
import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';
import type { StartedRedisContainer } from '@testcontainers/redis';
import type { StartedTestContainer } from 'testcontainers';

/**
 * QA da HU30 (PZ-195), ponta a ponta com Postgres, Redis e Mailpit reais: pedido → outbox →
 * worker → SMTP → Mailpit; webhook SNS assinado → supressão e aviso no portal. Dados FICTÍCIOS.
 */
const TENANT = '01a10e00-0000-7000-8000-000000000c01' as Uuid;
const ANA = '01a10e00-0000-7000-8000-000000000a01' as Uuid;
const BIA = '01a10e00-0000-7000-8000-000000000b01' as Uuid;
const TOPICO = 'arn:aws:sns:sa-east-1:000000000000:pz-entregas';
const CERT = 'https://sns.sa-east-1.amazonaws.com/SimpleNotificationService-teste.pem';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const relogio = new SystemClock();

let postgres: BancoDeTeste;
let redis: StartedRedisContainer;
let mailpit: StartedTestContainer;
let api = '';
let worker: INestApplicationContext;
let banco: Banco;
let notificar: Notificar<Transacao>;

interface Resumo {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

async function caixa(): Promise<Resumo[]> {
  const resposta = (await (await fetch(`${api}/messages`)).json()) as { messages: Resumo[] };
  return resposta.messages;
}

async function esperar(
  condicao: () => boolean | Promise<boolean>,
  limiteMs = 20_000,
): Promise<void> {
  const limite = performance.now() + limiteMs;
  while (!(await condicao())) {
    if (performance.now() > limite) throw new Error('condição não atingida a tempo');
    await new Promise((resolver) => setTimeout(resolver, 50));
  }
}

const noTenant = <T>(trabalho: (tx: Transacao) => Promise<T>) =>
  executarNoTenant(TENANT, () => banco.executar(trabalho));

const pedidoDe = (usuarioId: Uuid, janela = '2026-10-07') => ({
  tipo: 'lembrete-prazo',
  tenantId: TENANT,
  usuarioId,
  janela,
  dados: {
    numeroProcesso: '0000001-00.2026.8.26.0000',
    vencimento: '15/10/2026',
    link: 'https://app.exemplo.invalid/prazos/1',
  },
});

async function solicitar(usuarioId: Uuid, janela?: string): Promise<Uuid> {
  const r = await noTenant((tx) => notificar.executar(tx, pedidoDe(usuarioId, janela)));
  if (!r.ok || !r.valor.solicitada) throw new Error('notificação não solicitada');
  return r.valor.notificacaoId;
}

/** Mensagem SNS assinada como o SNS assina (assinatura v2), com o evento do SES dentro. */
function sns(messageId: string, evento: unknown): Uint8Array {
  const campos: Record<string, string> = {
    Type: 'Notification',
    MessageId: messageId,
    TopicArn: TOPICO,
    Message: JSON.stringify(evento),
    Timestamp: '2026-10-07T12:00:00.000Z',
  };
  const texto = ['Message', 'MessageId', 'Timestamp', 'TopicArn', 'Type']
    .map((k) => `${k}\n${String(campos[k])}\n`)
    .join('');
  const assinatura = createSign('RSA-SHA256').update(texto).sign(privateKey, 'base64');
  const corpo = { ...campos, SignatureVersion: '2', Signature: assinatura, SigningCertURL: CERT };
  return new TextEncoder().encode(JSON.stringify(corpo));
}

const gravarWebhook = (idExterno: string, corpo: Uint8Array) =>
  banco.executarSemTenant('webhook de entrada', (tx) =>
    new WebhooksPostgres().gravar(tx, { adaptador: 'ses', idExterno, cabecalhos: {}, corpo }),
  );

beforeAll(async () => {
  [postgres, redis, mailpit] = await Promise.all([
    subirBancoDeTeste(),
    new RedisContainer('redis:8.6.7-alpine').start(),
    // Mesma imagem do ambiente local (infra/docker/compose.yml).
    new GenericContainer('axllent/mailpit:v1.31.4')
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forHttp('/readyz', 8025))
      .start(),
  ]);
  api = `http://${mailpit.getHost()}:${String(mailpit.getMappedPort(8025))}/api/v1`;
  await postgres.migrar();
  const sistema = await postgres.conectar('pz_sistema');
  await sistema.query(
    `INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'Escritório QA', 'escritorio')`,
    [TENANT],
  );
  await sistema.query(
    `INSERT INTO usuario (id, tenant_id, nome, email) VALUES
       ($1, $3, 'Ana (fictícia)', 'ana@exemplo.invalid'),
       ($2, $3, 'Bia (fictícia)', 'bia@exemplo.invalid')`,
    [ANA, BIA, TENANT],
  );
  await sistema.end();

  // O e-mail real sai do ambiente (EMAIL_PROVEDOR=smtp, padrão) para o Mailpit.
  const ambiente = carregarAmbiente(esquemaWorker, {
    NODE_ENV: 'test',
    DATABASE_URL: postgres.url('pz_app'),
    DATABASE_URL_SISTEMA: postgres.url('pz_sistema'),
    SMTP_HOST: mailpit.getHost(),
    SMTP_PORT: String(mailpit.getMappedPort(1025)),
    SMTP_EXIGIR_TLS: 'false',
    CHAVE_CIFRAGEM: 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=',
    REDIS_URL: redis.getConnectionUrl(),
    S3_REGION: 'us-east-1',
    RELAY_INTERVALO_MS: '100',
  });
  // Webhook do SES de verdade (assinatura e interpretação); só o download do certificado é local.
  const ses = new WebhooksSes({
    topicos: [TOPICO],
    http: (url) =>
      Promise.resolve({
        ok: url === CERT,
        status: url === CERT ? 200 : 404,
        text: () => Promise.resolve(PEM),
      }),
  });
  const desfechos = new RegistrarDesfechosDeEntrega(
    new NotificacoesPostgres(),
    new SupressaoPostgres(),
    new OutboxPostgres(),
    relogio,
  );
  worker = await criarWorker({
    ambiente,
    processadoresDeWebhook: new Map([
      ['ses', processadorDeEntregas((webhook) => ses.interpretar(webhook), desfechos)],
    ]),
  });
  await worker.init();
  banco = new Banco({ url: postgres.url('pz_app') });
  const emails = new EmailsDosUsuariosPostgres();
  notificar = new Notificar(
    new NotificacoesPostgres(),
    new PreferenciasPostgres(),
    {
      emails: async (tx, usuarioId) => {
        const principal = await emails.emailDe(tx, usuarioId);
        return { ...(principal === undefined ? {} : { principal }), copias: [] };
      },
    },
    new SupressaoPostgres(),
    new ConsentimentosPostgres(),
    new OutboxPostgres(),
    relogio,
  );
}, 300_000);

afterAll(async () => {
  await worker.close();
  await banco.encerrar();
  await Promise.all([postgres.parar(), redis.stop(), mailpit.stop()]);
});

describe('QA das notificações por e-mail (HU30, PZ-195)', () => {
  let idAna = '';
  let idBia = '';

  it('o envio local cai no Mailpit com HTML e texto, uma vez por notificação', async () => {
    const ana = await solicitar(ANA);
    const bia = await solicitar(BIA);
    // Pedido repetido (reprocessamento): a chave de idempotência barra a segunda notificação.
    const repetido = await noTenant((tx) => notificar.executar(tx, pedidoDe(ANA)));
    expect(repetido.ok && repetido.valor).toEqual({ solicitada: false, motivo: 'ja-solicitada' });

    await esperar(async () => (await caixa()).length === 2);
    const mensagens = await caixa();
    const daAna = mensagens.find((m) => m.To.some((d) => d.Address === 'ana@exemplo.invalid'));
    expect(daAna?.Subject).toBe('Prazo do processo 0000001-00.2026.8.26.0000 vence em 15/10/2026');
    const completa = (await (await fetch(`${api}/message/${String(daAna?.ID)}`)).json()) as {
      HTML: string;
      Text: string;
    };
    expect(completa.HTML).toContain('href="https://app.exemplo.invalid/prazos/1"');
    expect(completa.Text).toContain('15/10/2026');
    expect(completa.Text).toContain('https://app.exemplo.invalid/prazos/1');

    const gravadas = await noTenant((tx) =>
      tx.notificacao.findMany({ where: { id: { in: [ana, bia] } } }),
    );
    expect(gravadas.every((n) => n.enviadaEm !== null && n.idExterno !== null)).toBe(true);
    idAna = String(gravadas.find((n) => n.id === ana)?.idExterno);
    idBia = String(gravadas.find((n) => n.id === bia)?.idExterno);
  }, 60_000);

  it('o mesmo evento processado duas vezes envia um único e-mail', async () => {
    const [evento] = await noTenant((tx) =>
      tx.eventoDominio.findMany({ where: { tipo: 'NotificacaoSolicitada' }, take: 1 }),
    );
    if (evento === undefined) throw new Error('evento ausente');
    // Entrega duplicada: outro evento com o mesmo pedido (ex.: republicação após falha).
    const duplicado = gerarUuidV7();
    await noTenant((tx) =>
      new OutboxPostgres().gravar(tx, [
        {
          id: duplicado,
          tipo: 'NotificacaoSolicitada',
          versao: 1,
          tenantId: TENANT,
          agregadoId: evento.agregadoId,
          ocorridoEm: relogio.agora(),
          payload: evento.payload,
        },
      ]),
    );
    const sistema = await postgres.conectar('pz_sistema');
    await esperar(
      async () =>
        ((await sistema.query('SELECT 1 FROM evento_processado WHERE evento_id = $1', [duplicado]))
          .rowCount ?? 0) > 0,
    );
    await sistema.end();
    expect(await caixa()).toHaveLength(2);
  }, 60_000);

  it('bounce e spam pelo webhook: supressão, aviso no portal e nenhum e-mail novo', async () => {
    const mail = (id: string) => ({
      messageId: `ses-${id}`,
      timestamp: '2026-10-07T11:59:00.000Z',
      commonHeaders: { messageId: id },
    });
    const bounce = sns('sns-bounce', {
      eventType: 'Bounce',
      mail: mail(idAna),
      bounce: {
        bounceType: 'Permanent',
        bounceSubType: 'General',
        bouncedRecipients: [{ emailAddress: 'ana@exemplo.invalid' }],
        timestamp: '2026-10-07T12:00:00.000Z',
      },
    });
    const spam = sns('sns-spam', {
      eventType: 'Complaint',
      mail: mail(idBia),
      complaint: {
        complainedRecipients: [{ emailAddress: 'bia@exemplo.invalid' }],
        complaintFeedbackType: 'abuse',
        timestamp: '2026-10-07T12:00:00.000Z',
      },
    });
    expect(await gravarWebhook('sns-bounce', bounce)).toBe(true);
    expect(await gravarWebhook('sns-bounce', bounce)).toBe(false);
    expect(await gravarWebhook('sns-spam', spam)).toBe(true);

    const sistema = await postgres.conectar('pz_sistema');
    const supressoes = async () =>
      (
        await sistema.query<{ email: string; motivo: string }>(
          'SELECT email, motivo FROM supressao ORDER BY email',
        )
      ).rows;
    await esperar(async () => (await supressoes()).length === 2);
    expect(await supressoes()).toEqual([
      { email: 'ana@exemplo.invalid', motivo: 'bounce' },
      { email: 'bia@exemplo.invalid', motivo: 'spam' },
    ]);
    await sistema.end();

    const rejeitada = await noTenant((tx) =>
      tx.notificacao.findUniqueOrThrow({ where: { idExterno: idAna } }),
    );
    expect(rejeitada.motivoRejeicao).toBe('bounce: Permanent/General');

    // Aviso no portal (o que GET /v1/notificacoes/avisos devolve): a pessoa e quem administra.
    const avisos = new ConsultarAvisosDeEntrega(
      { executar: noTenant },
      new NotificacoesPostgres(),
      {
        emails: async (tx, usuarioId) => {
          const principal = await new EmailsDosUsuariosPostgres().emailDe(tx, usuarioId);
          return { ...(principal === undefined ? {} : { principal }), copias: [] };
        },
      },
      new SupressaoPostgres(),
      relogio,
    );
    expect(await avisos.executar(ANA, false)).toEqual({
      emailsRejeitados: ['ana@exemplo.invalid'],
      usuariosDaEquipeComRejeicao: null,
    });
    expect((await avisos.executar(BIA, true)).usuariosDaEquipeComRejeicao).toBe(2);

    // Endereço suprimido não recebe mais nada.
    const nova = await noTenant((tx) => notificar.executar(tx, pedidoDe(ANA, '2026-10-08')));
    expect(nova.ok && nova.valor).toEqual({ solicitada: false, motivo: 'sem-destinatario' });
    expect(await caixa()).toHaveLength(2);
  }, 60_000);
});
