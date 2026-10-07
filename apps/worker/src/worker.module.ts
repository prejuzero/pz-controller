import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ArmazenamentoS3 } from '@pz/adapter-s3';
import { DESCRITOR_SMTP, ProvedorEmailSmtp } from '@pz/adapter-smtp';
import {
  AuditarEvento,
  CadeiaPostgres,
  sha256,
  TrilhaPostgres,
  VerificarIntegridade,
} from '@pz/auditoria';
import { CacheDeDiasNaoUteisRedis, InvalidarCacheDoCalendario } from '@pz/calendario';
import { Banco, BancoSistema, OutboxPostgres } from '@pz/db';
import { CifraAesGcm, EmailsDosUsuariosPostgres, EnviarAvisosDeSeguranca } from '@pz/identidade';
import { RegistroDeAdaptadores } from '@pz/integracoes';
import { SystemClock } from '@pz/kernel';
import { EnviarNotificacao, NotificacoesPostgres } from '@pz/notificacoes';
import { criarLogger, registrarErro } from '@pz/observability';
import {
  ConsultarSituacao,
  HistoricoEmMemoria,
  RegistrarHistoricoDeSituacao,
  VerificadorHttp,
} from '@pz/saude';
import { Redis } from 'ioredis';

import { ConsumidorDeAuditoria } from './auditoria/consumidor.js';
import { ConsumidorDoCalendario } from './calendario/consumidor.js';
import { DespachanteDeEventos } from './eventos/consome.js';
import { RelayDoOutbox } from './eventos/relay.js';
import {
  AMBIENTE,
  BANCO,
  BANCO_SISTEMA,
  FILAS_RUNTIME,
  FONTE_DO_RELAY,
  LIMPEZA_DO_OUTBOX,
  PROCESSADORES_DE_WEBHOOK,
  REDIS,
  REGISTRO_DE_PROCESSAMENTO,
  RELOGIO,
  UNIDADE_DA_LIMPEZA,
  UNIDADE_DE_TRABALHO,
  UNIDADE_DO_RELAY,
  UNIDADE_DOS_WEBHOOKS,
  VERIFICADORES,
} from './fichas.js';
import { Filas } from './filas/runtime.js';
import { ServicoDeFilas } from './filas/servico.js';
import { ConsumidorDeAvisosDeIdentidade } from './identidade/consumidor.js';
import { RelayDeWebhooks } from './integracoes/webhooks.js';
import { ConsumidorDeNotificacoes } from './notificacoes/consumidor.js';
import { RecursosDoBanco } from './recursos.js';
import { ConsumidorDeSituacao } from './saude/consumidor.js';

import type { AmbienteWorker } from './ambiente.js';
import type { FonteDoRelay } from './eventos/relay.js';
import type { ProcessadorDeWebhook } from './integracoes/webhooks.js';
import type { DynamicModule, Provider } from '@nestjs/common';
import type { DestinoWorm } from '@pz/auditoria';
import type { CacheDeDiasNaoUteis } from '@pz/calendario';
import type { ProvedorEmail } from '@pz/integracoes';
import type { Clock, OutboxEmMemoria, Uuid } from '@pz/kernel';
import type { VerificadorDeDependencia } from '@pz/saude';

export interface OpcoesWorker {
  readonly ambiente: AmbienteWorker;
  /** Substituições para testes. */
  readonly relogio?: Clock;
  readonly verificadores?: readonly VerificadorDeDependencia[];
  /** Outbox em memória no lugar do PostgreSQL (testes unitários, sem banco). */
  readonly outbox?: OutboxEmMemoria;
  /** false nos testes que não sobem Redis: sem filas nem relay. Padrão: true. */
  readonly filas?: boolean;
  /** Processadores de webhook por ID do adaptador (cada adaptador com webhook entra aqui). */
  readonly processadoresDeWebhook?: ReadonlyMap<string, ProcessadorDeWebhook>;
  /** Provedor de e-mail no lugar do SMTP (testes). */
  readonly email?: ProvedorEmail;
  /** Destino WORM no lugar do S3 (testes). */
  readonly worm?: DestinoWorm;
  /** Cache do calendário no lugar do Redis (testes). */
  readonly cacheDoCalendario?: CacheDeDiasNaoUteis;
}

function verificadoresDoAmbiente(
  ambiente: AmbienteWorker,
  banco: Banco,
  redis: Redis,
): VerificadorDeDependencia[] {
  return [
    // Banco e Redis no protocolo de cada um, pelas mesmas conexões do worker.
    { nome: 'banco', verificar: () => banco.verificar() },
    {
      nome: 'redis',
      verificar: async () => {
        await redis.ping(); // rejeita se o Redis não responder
      },
    },
    ...(ambiente.S3_ENDPOINT === undefined
      ? []
      : [new VerificadorHttp('armazenamento', ambiente.S3_ENDPOINT)]),
  ];
}

const logger = criarLogger('worker');

/** Outbox em memória com a interface de origem do relay (sem contexto de trace). */
function fonteEmMemoria(outbox: OutboxEmMemoria): FonteDoRelay<unknown> {
  return {
    reservarPendentesComContexto: async (transacao, limite) =>
      (await outbox.reservarPendentes(transacao as never, limite)).map((evento) => ({
        evento,
        contexto: {},
      })),
    marcarPublicados: (transacao, ids, em) => outbox.marcarPublicados(transacao as never, ids, em),
  };
}

/** Cópia WORM da auditoria no bucket com object lock (modo COMPLIANCE). */
function wormDoAmbiente(ambiente: AmbienteWorker, relogio: Clock): DestinoWorm {
  const dias = ambiente.AUDITORIA_WORM_RETENCAO_DIAS;
  if (
    dias === undefined &&
    ambiente.NODE_ENV === 'production' &&
    ambiente.S3_ENDPOINT === undefined
  ) {
    throw new Error('Defina AUDITORIA_WORM_RETENCAO_DIAS (prazo legal de retenção da auditoria)');
  }
  const armazenamento = new ArmazenamentoS3(
    {
      bucket: ambiente.AUDITORIA_WORM_BUCKET,
      regiao: ambiente.S3_REGION,
      ...(ambiente.S3_ENDPOINT === undefined ? {} : { endpoint: ambiente.S3_ENDPOINT }),
      ...(ambiente.S3_ACCESS_KEY_ID === undefined || ambiente.S3_SECRET_ACCESS_KEY === undefined
        ? {}
        : {
            credenciais: {
              idChave: ambiente.S3_ACCESS_KEY_ID,
              segredo: ambiente.S3_SECRET_ACCESS_KEY,
            },
          }),
      forcarPathStyle: ambiente.S3_FORCE_PATH_STYLE,
      criptografia: ambiente.S3_ENDPOINT === undefined ? 'AES256' : 'nenhuma',
      tiposPermitidos: ['application/x-ndjson'],
      tamanhoMaximoBytes: 512 * 1024 * 1024,
      retencaoDias: dias ?? 1,
    },
    relogio,
  );
  return {
    gravar: (tenantId, caminho, conteudo) =>
      armazenamento.gravar({
        tenantId: tenantId as Uuid,
        caminho,
        conteudo,
        tipoMime: 'application/x-ndjson',
      }),
  };
}

/** E-mail pelo registro de adaptadores (resiliência, telemetria e saúde padrão, ADR-005). */
function emailDoAmbiente(ambiente: AmbienteWorker, relogio: Clock): ProvedorEmail {
  const registro = new RegistroDeAdaptadores({ padrao: { 'provedor-email': 'smtp' } }, { relogio });
  registro.registrar(
    DESCRITOR_SMTP,
    () =>
      new ProvedorEmailSmtp(
        {
          host: ambiente.SMTP_HOST,
          porta: ambiente.SMTP_PORT,
          tls: false,
          exigirStartTls: ambiente.SMTP_EXIGIR_TLS,
          remetente: ambiente.EMAIL_REMETENTE,
        },
        relogio,
      ),
  );
  registro.validar();
  return registro.obter('provedor-email');
}

/** Composição do worker: filas, relay do outbox e consumidores de eventos (lista explícita). */
@Module({})
export class WorkerModule {
  static registrar(opcoes: OpcoesWorker): DynamicModule {
    const { ambiente } = opcoes;
    // lazyConnect: só conecta quando usada; maxRetriesPerRequest null: exigência do BullMQ.
    const redis = new Redis(ambiente.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
    // Sem tratador, o ioredis imprime cada falha de reconexão no console, fora do log estruturado.
    // Registra pelo logger, no máximo uma vez por minuto (a prontidão já mostra o Redis fora).
    let ultimoErroRedis = Number.NEGATIVE_INFINITY;
    redis.on('error', (erro: Error) => {
      if (performance.now() - ultimoErroRedis < 60_000) return;
      ultimoErroRedis = performance.now();
      registrarErro(logger, erro, 'conexão com o Redis indisponível', 'worker.redis');
    });
    const banco = new Banco({ url: ambiente.DATABASE_URL });
    const sistema = new BancoSistema({ url: ambiente.DATABASE_URL_SISTEMA, maxConexoes: 4 });
    const outboxPostgres = new OutboxPostgres();
    const emMemoria = opcoes.outbox;

    const provedores: Provider[] = [
      { provide: REDIS, useValue: redis },
      { provide: BANCO, useValue: banco },
      { provide: BANCO_SISTEMA, useValue: sistema },
      { provide: AMBIENTE, useValue: ambiente },
      { provide: RELOGIO, useValue: opcoes.relogio ?? new SystemClock() },
      {
        provide: VERIFICADORES,
        useValue: opcoes.verificadores ?? verificadoresDoAmbiente(ambiente, banco, redis),
      },
      // Consumo no tenant do evento (pz_app) e deduplicação em evento_processado.
      { provide: UNIDADE_DE_TRABALHO, useValue: emMemoria ?? banco },
      { provide: REGISTRO_DE_PROCESSAMENTO, useValue: emMemoria ?? outboxPostgres },
      // Relay atravessa tenants: papel sistema, com motivo registrado.
      { provide: UNIDADE_DO_RELAY, useValue: emMemoria ?? sistema.unidade('relay do outbox') },
      // Limpeza diária do outbox: também atravessa tenants (sistema, motivo registrado).
      { provide: UNIDADE_DA_LIMPEZA, useValue: sistema.unidade('limpeza do outbox') },
      { provide: LIMPEZA_DO_OUTBOX, useValue: outboxPostgres },
      // Webhooks de entrada: tabela global, lida e processada como sistema.
      { provide: UNIDADE_DOS_WEBHOOKS, useValue: sistema.unidade('webhooks de entrada') },
      { provide: PROCESSADORES_DE_WEBHOOK, useValue: opcoes.processadoresDeWebhook ?? new Map() },
      {
        provide: FONTE_DO_RELAY,
        useValue: emMemoria === undefined ? outboxPostgres : fonteEmMemoria(emMemoria),
      },
      {
        provide: ConsultarSituacao,
        inject: [VERIFICADORES, RELOGIO],
        useFactory: (verificadores: VerificadorDeDependencia[], relogio: Clock) =>
          new ConsultarSituacao(verificadores, relogio, ambiente.VERSAO),
      },
      { provide: HistoricoEmMemoria, useValue: new HistoricoEmMemoria() },
      {
        provide: RegistrarHistoricoDeSituacao,
        inject: [HistoricoEmMemoria],
        useFactory: (historico: HistoricoEmMemoria) => new RegistrarHistoricoDeSituacao(historico),
      },
      {
        provide: FILAS_RUNTIME,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new Filas({ redis, relogio, filasAtivas: ambiente.WORKER_QUEUES }),
      },
      DespachanteDeEventos,
      ...(opcoes.filas === false ? [] : [ServicoDeFilas, RelayDoOutbox, RelayDeWebhooks]),
      RecursosDoBanco,
      // Consumidores (lista explícita, CLAUDE.md seção 6).
      ConsumidorDeSituacao,
      ConsumidorDeAvisosDeIdentidade,
      ConsumidorDeNotificacoes,
      ConsumidorDeAuditoria,
      ConsumidorDoCalendario,
      {
        provide: InvalidarCacheDoCalendario,
        useValue: new InvalidarCacheDoCalendario(
          opcoes.cacheDoCalendario ??
            new CacheDeDiasNaoUteisRedis(redis, (erro) => {
              registrarErro(logger, erro, 'cache do calendário indisponível', 'calendario.cache');
            }),
        ),
      },
      { provide: AuditarEvento, useValue: new AuditarEvento(new TrilhaPostgres()) },
      {
        provide: VerificarIntegridade,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new VerificarIntegridade(
            sistema.unidade('verificação da trilha de auditoria'),
            new CadeiaPostgres(),
            opcoes.worm ?? wormDoAmbiente(ambiente, relogio),
            sha256,
            relogio,
          ),
      },
      {
        provide: EnviarAvisosDeSeguranca,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new EnviarAvisosDeSeguranca(
            opcoes.email ?? emailDoAmbiente(ambiente, relogio),
            new EmailsDosUsuariosPostgres(),
            new CifraAesGcm(ambiente.CHAVE_CIFRAGEM),
            ambiente.PORTAL_URL,
          ),
      },
      {
        provide: EnviarNotificacao,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) => {
          const email = opcoes.email ?? emailDoAmbiente(ambiente, relogio);
          return new EnviarNotificacao(
            new NotificacoesPostgres(),
            {
              email: {
                enviar: ({ idempotencia, destinatarios, mensagem }) =>
                  email.enviar({ idempotencia, para: [...destinatarios], ...mensagem }),
              },
            },
            relogio,
          );
        },
      },
    ];
    return { module: WorkerModule, imports: [DiscoveryModule], providers: provedores };
  }
}
