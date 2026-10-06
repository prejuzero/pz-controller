import { Inject, Injectable } from '@nestjs/common';
import { VerificarIntegridade } from '@pz/auditoria';
import { limparOutbox } from '@pz/kernel';
import {
  criarLogger,
  registrarDivergenciaDeAuditoria,
  registrarErro,
  registrarSituacaoDasFilas,
} from '@pz/observability';

import { DespachanteDeEventos } from '../eventos/consome.js';
import { consumirEvento, desserializarEvento } from '../eventos/job-evento.js';
import {
  FILAS_RUNTIME,
  LIMPEZA_DO_OUTBOX,
  PROCESSADORES_DE_WEBHOOK,
  REDIS,
  RELOGIO,
  UNIDADE_DA_LIMPEZA,
  UNIDADE_DOS_WEBHOOKS,
} from '../fichas.js';
import { processarWebhook, tratarWebhook } from '../integracoes/webhooks.js';

import {
  AGENDAMENTOS,
  limparOutboxJob,
  RETENCAO_DO_OUTBOX_MS,
  verificarAuditoriaJob,
} from './agendamento.js';
import { Filas } from './runtime.js';

import type { ProcessadorDeWebhook } from '../integracoes/webhooks.js';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { Transacao } from '@pz/db';
import type { Clock, LimpezaDoOutbox, UnidadeDeTrabalho } from '@pz/kernel';
import type { Redis } from 'ioredis';

const logger = criarLogger('worker.manutencao');

/**
 * Ciclo de vida das filas no worker: registra os tratadores, começa a consumir no boot, publica
 * a situação das filas (profundidade, idade do mais antigo, DLQ) para as métricas e alertas, e
 * no desligamento espera os jobs em andamento terminarem antes de fechar a conexão.
 */
@Injectable()
export class ServicoDeFilas implements OnApplicationBootstrap, OnApplicationShutdown {
  #cancelarMetricas: (() => void) | undefined;

  constructor(
    @Inject(FILAS_RUNTIME) private readonly filas: Filas,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DespachanteDeEventos) private readonly despachante: DespachanteDeEventos,
    @Inject(UNIDADE_DA_LIMPEZA) private readonly unidadeDaLimpeza: UnidadeDeTrabalho<unknown>,
    @Inject(LIMPEZA_DO_OUTBOX) private readonly limpeza: LimpezaDoOutbox<unknown>,
    @Inject(RELOGIO) private readonly relogio: Clock,
    @Inject(UNIDADE_DOS_WEBHOOKS) private readonly unidadeDosWebhooks: UnidadeDeTrabalho<Transacao>,
    @Inject(PROCESSADORES_DE_WEBHOOK)
    private readonly processadores: ReadonlyMap<string, ProcessadorDeWebhook>,
    @Inject(VerificarIntegridade) private readonly integridade: VerificarIntegridade<unknown>,
  ) {}

  onApplicationBootstrap(): void {
    // Eventos do outbox: um job por consumidor, validado contra o contrato antes de consumir.
    this.filas.registrar(consumirEvento, async (dados) => {
      await this.despachante.consumir(dados.consumidor, desserializarEvento(dados.evento));
    });
    this.filas.registrar(limparOutboxJob, async () => {
      const removidos = await limparOutbox(this.unidadeDaLimpeza, this.limpeza, this.relogio, {
        retencaoMs: RETENCAO_DO_OUTBOX_MS,
        lote: 1_000,
      });
      logger.info(removidos, 'limpeza do outbox concluída');
    });
    this.filas.registrar(verificarAuditoriaJob, async () => {
      const resultados = await this.integridade.executar();
      for (const resultado of resultados) {
        if (resultado.situacao === 'integra') continue;
        // Alerta crítico: adulteração ou registros apagados (nada falha em silêncio).
        registrarDivergenciaDeAuditoria();
        registrarErro(
          logger,
          new Error(`auditoria divergente no tenant ${resultado.tenantId}: ${resultado.motivo}`),
          'trilha de auditoria divergente',
          'auditoria.integridade',
        );
      }
      const exportados = resultados.reduce(
        (total, r) => total + (r.situacao === 'integra' ? r.exportados : 0),
        0,
      );
      logger.info({ tenants: resultados.length, exportados }, 'verificação da auditoria concluída');
    });
    this.filas.registrar(processarWebhook, ({ id }) =>
      tratarWebhook(this.unidadeDosWebhooks, this.processadores, this.relogio, id),
    );
    this.filas.validarAgendamentos(AGENDAMENTOS);
    this.filas.iniciar();
    // Sem esperar o Redis: com ele fora, o worker sobe e a prontidão mostra a falha; os
    // agendadores são gravados quando a conexão voltar. Falha aqui vira log, métrica e alerta.
    void this.filas.agendar(AGENDAMENTOS).catch((erro: unknown) => {
      registrarErro(logger, erro, 'falha ao registrar os jobs recorrentes', 'worker.agendador');
    });
    this.#cancelarMetricas = registrarSituacaoDasFilas(() => this.filas.situacao());
  }

  async onApplicationShutdown(): Promise<void> {
    this.#cancelarMetricas?.();
    await this.filas.encerrar();
    // quit educado com o Redis no ar; disconnect se ele não responder.
    await Promise.race([
      this.redis.quit().catch(() => undefined),
      new Promise((resolver) => setTimeout(resolver, 2_000)),
    ]);
    this.redis.disconnect();
  }
}
