import { Inject, Injectable } from '@nestjs/common';
import { VerificarIntegridade } from '@pz/auditoria';
import { ExecutarCaptura, PlanejarCaptura } from '@pz/captura';
import { limparOutbox } from '@pz/kernel';
import {
  criarLogger,
  registrarDivergenciaDeAuditoria,
  registrarErro,
  registrarSituacaoDasFilas,
} from '@pz/observability';
import { EfetivarEncerramentos } from '@pz/privacidade';

import {
  agendamentoDaCaptura,
  ESCOPO_DA_CAPTURA,
  executarCapturaJob,
  planejarCapturaJob,
} from '../captura/jobs.js';
import { DespachanteDeEventos } from '../eventos/consome.js';
import { consumirEvento, desserializarEvento } from '../eventos/job-evento.js';
import {
  AMBIENTE,
  FILAS_RUNTIME,
  LIMPEZA_DO_OUTBOX,
  PROCESSADORES_DE_WEBHOOK,
  REDIS,
  RELOGIO,
  UNIDADE_DA_LIMPEZA,
  UNIDADE_DOS_WEBHOOKS,
} from '../fichas.js';
import { processarWebhook, tratarWebhook } from '../integracoes/webhooks.js';
import { AGENDAMENTO_DOS_ENCERRAMENTOS, efetivarEncerramentosJob } from '../privacidade/jobs.js';

import {
  AGENDAMENTOS,
  limparOutboxJob,
  RETENCAO_DO_OUTBOX_MS,
  verificarAuditoriaJob,
} from './agendamento.js';
import { Filas } from './runtime.js';

import type { AmbienteWorker } from '../ambiente.js';
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
    @Inject(AMBIENTE) private readonly ambiente: AmbienteWorker,
    @Inject(PlanejarCaptura) private readonly planejarCaptura: PlanejarCaptura<unknown>,
    @Inject(ExecutarCaptura) private readonly executarCaptura: ExecutarCaptura<unknown>,
    @Inject(EfetivarEncerramentos)
    private readonly efetivarEncerramentos: EfetivarEncerramentos<unknown>,
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
    // Captura (HU17): o planejamento enfileira um job por alvo, espalhados pelo jitter.
    this.filas.registrar(planejarCapturaJob, async () => {
      const planos = await this.planejarCaptura.executar();
      for (const { chave, ...dados } of planos) {
        const atrasoMs = Math.floor(Math.random() * this.ambiente.CAPTURA_JITTER_MS);
        await this.filas.publicar(executarCapturaJob, dados, ESCOPO_DA_CAPTURA, chave, {
          atrasoMs,
        });
      }
      logger.info({ alvos: planos.length }, 'captura planejada');
    });
    this.filas.registrar(executarCapturaJob, async (dados) => {
      const resultado = await this.executarCaptura.executar(dados);
      logger.info({ alvoId: dados.alvoId, ...resultado }, 'captura executada');
    });
    this.filas.registrar(efetivarEncerramentosJob, async () => {
      const encerrados = await this.efetivarEncerramentos.executar();
      logger.info({ tenants: encerrados.length }, 'encerramentos de conta efetivados');
    });
    const agendamentos = [
      ...AGENDAMENTOS,
      agendamentoDaCaptura(this.ambiente.CAPTURA_CRON),
      AGENDAMENTO_DOS_ENCERRAMENTOS,
    ];
    this.filas.validarAgendamentos(agendamentos);
    this.filas.iniciar();
    // Sem esperar o Redis: com ele fora, o worker sobe e a prontidão mostra a falha; os
    // agendadores são gravados quando a conexão voltar. Falha aqui vira log, métrica e alerta.
    void this.filas.agendar(agendamentos).catch((erro: unknown) => {
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
