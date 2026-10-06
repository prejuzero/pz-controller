import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Banco, WebhooksPostgres } from '@pz/db';
import {
  AtivarSegundoFator,
  Autenticar,
  CifraAesGcm,
  ConfigurarSegundoFator,
  CredenciaisPostgres,
  ElevarSessao,
  EncerrarSessao,
  GeradorDeTokensSeguro,
  HasherArgon2,
  SegredosTotp,
  SegundoFatorPostgres,
  SessoesRedis,
  ValidarSessao,
  VerificarSegundoFator,
} from '@pz/identidade';
import { SystemClock } from '@pz/kernel';
import { criarLogger, registrarErro } from '@pz/observability';
import { ConsultarSituacao, VerificadorHttp, VerificadorTcp } from '@pz/saude';
import { Redis } from 'ioredis';

import { AuthController } from './auth/auth.controller.js';
import { ContextoDoUsuario } from './auth/contexto-do-usuario.js';
import {
  AMBIENTE,
  CAIXA_DE_WEBHOOKS,
  RECEPTORES_DE_WEBHOOK,
  RELOGIO,
  VERIFICADORES,
} from './fichas.js';
import { GuardaDeAcesso } from './http/acesso.js';
import { FiltroDeProblemas } from './http/problemas.js';
import { OpenApiController } from './openapi.controller.js';
import { SaudeController, SondasController } from './saude/saude.controller.js';
import { WebhooksController } from './webhooks/webhooks.controller.js';

import type { AmbienteApi } from './ambiente.js';
import type { CaixaDeWebhooks } from './webhooks/webhooks.controller.js';
import type { DynamicModule, Provider, Type } from '@nestjs/common';
import type {
  ArmazemDeSessoes,
  RepositorioDeCredenciais,
  RepositorioDeSegundoFator,
} from '@pz/identidade';
import type { ReceptorWebhook } from '@pz/integracoes';
import type { Clock } from '@pz/kernel';
import type { VerificadorDeDependencia } from '@pz/saude';

export interface OpcoesApi {
  readonly ambiente: AmbienteApi;
  /** Substituições para testes (ex.: relógio fixo, verificadores falsos). */
  readonly relogio?: Clock;
  readonly verificadores?: readonly VerificadorDeDependencia[];
  readonly controllersExtras?: readonly Type[];
  readonly caixaDeWebhooks?: CaixaDeWebhooks;
  /** Receptores por ID do adaptador; cada adaptador com webhook entra aqui (HU30 em diante). */
  readonly receptoresDeWebhook?: ReadonlyMap<string, ReceptorWebhook>;
  /** Credenciais e sessões em memória nos testes (sem PostgreSQL e Redis). */
  readonly identidade?: {
    readonly credenciais: RepositorioDeCredenciais;
    readonly sessoes: ArmazemDeSessoes;
    readonly segundoFator: RepositorioDeSegundoFator;
  };
}

/** Dependências que /health/ready e /v1/saude conferem (ADR-010). */
function verificadoresDoAmbiente(ambiente: AmbienteApi): VerificadorDeDependencia[] {
  return [
    new VerificadorTcp('banco', ambiente.DATABASE_URL),
    new VerificadorTcp('redis', ambiente.REDIS_URL),
    ...(ambiente.S3_ENDPOINT === undefined
      ? []
      : [new VerificadorHttp('armazenamento', ambiente.S3_ENDPOINT)]),
  ];
}

const logger = criarLogger('api');

/** Conexões da api (PostgreSQL como pz_app e Redis), fechadas no desligamento. */
class RecursosDaApi {
  readonly banco: Banco;
  readonly redis: Redis;
  #ultimoErroRedis = Number.NEGATIVE_INFINITY;

  constructor(ambiente: AmbienteApi) {
    this.banco = new Banco({ url: ambiente.DATABASE_URL });
    this.redis = new Redis(ambiente.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    // Sem tratador, o ioredis imprime cada falha de reconexão fora do log estruturado.
    this.redis.on('error', (erro: Error) => {
      if (performance.now() - this.#ultimoErroRedis < 60_000) return;
      this.#ultimoErroRedis = performance.now();
      registrarErro(logger, erro, 'conexão com o Redis indisponível', 'api.redis');
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
    await this.banco.encerrar();
  }
}

/**
 * Composição da api/**
 * Composição da api (CLAUDE.md, seção 6): só liga módulos, controllers e infraestrutura HTTP.
 * Módulos entram por lista explícita.
 */
@Module({})
export class AppModule {
  static registrar(opcoes: OpcoesApi): DynamicModule {
    const recursos = new RecursosDaApi(opcoes.ambiente);
    const webhooks = new WebhooksPostgres();
    const credenciais = opcoes.identidade?.credenciais ?? new CredenciaisPostgres(recursos.banco);
    const sessoes = opcoes.identidade?.sessoes ?? new SessoesRedis(recursos.redis);
    const segundoFator =
      opcoes.identidade?.segundoFator ?? new SegundoFatorPostgres(recursos.banco);
    const segredos = new SegredosTotp();
    const cifra = new CifraAesGcm(opcoes.ambiente.CHAVE_CIFRAGEM);
    const tokens = new GeradorDeTokensSeguro();
    const provedores: Provider[] = [
      { provide: RecursosDaApi, useValue: recursos },
      { provide: AMBIENTE, useValue: opcoes.ambiente },
      { provide: RELOGIO, useValue: opcoes.relogio ?? new SystemClock() },
      {
        provide: VERIFICADORES,
        useValue: opcoes.verificadores ?? verificadoresDoAmbiente(opcoes.ambiente),
      },
      {
        provide: ConsultarSituacao,
        inject: [VERIFICADORES, RELOGIO],
        useFactory: (verificadores: VerificadorDeDependencia[], relogio: Clock) =>
          new ConsultarSituacao(verificadores, relogio, opcoes.ambiente.VERSAO),
      },
      {
        provide: CAIXA_DE_WEBHOOKS,
        // Webhook gravado sem tenant (ainda desconhecido), como pz_app: só INSERT na tabela global.
        useValue:
          opcoes.caixaDeWebhooks ??
          ({
            gravar: (webhook) =>
              recursos.banco.executarSemTenant('webhook de entrada', (tx) =>
                webhooks.gravar(tx, webhook),
              ),
          } satisfies CaixaDeWebhooks),
      },
      {
        provide: Autenticar,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new Autenticar(
            credenciais,
            new HasherArgon2(),
            sessoes,
            new GeradorDeTokensSeguro(),
            relogio,
          ),
      },
      {
        provide: ValidarSessao,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) => new ValidarSessao(sessoes, relogio),
      },
      { provide: EncerrarSessao, useValue: new EncerrarSessao(sessoes) },
      {
        provide: ConfigurarSegundoFator,
        useValue: new ConfigurarSegundoFator(segundoFator, segredos, cifra),
      },
      {
        provide: AtivarSegundoFator,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new AtivarSegundoFator(segundoFator, segredos, cifra, relogio),
      },
      {
        provide: VerificarSegundoFator,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new VerificarSegundoFator(segundoFator, segredos, cifra, relogio),
      },
      {
        provide: ElevarSessao,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) => new ElevarSessao(sessoes, tokens, relogio),
      },
      { provide: APP_INTERCEPTOR, useClass: ContextoDoUsuario },
      { provide: RECEPTORES_DE_WEBHOOK, useValue: opcoes.receptoresDeWebhook ?? new Map() },
      { provide: APP_GUARD, useClass: GuardaDeAcesso },
      { provide: APP_FILTER, useClass: FiltroDeProblemas },
    ];
    return {
      module: AppModule,
      controllers: [
        AuthController,
        SaudeController,
        SondasController,
        OpenApiController,
        WebhooksController,
        ...(opcoes.controllersExtras ?? []),
      ],
      providers: provedores,
    };
  }
}
