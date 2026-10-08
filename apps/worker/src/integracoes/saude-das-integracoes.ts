import { hostname } from 'node:os';

import { criarLogger, registrarErro } from '@pz/observability';

import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { PublicarSituacaoDasIntegracoes } from '@pz/administracao';
import type { RegistroDeAdaptadores } from '@pz/integracoes';

const logger = criarLogger('worker.integracoes');

export const INTERVALO_DO_RETRATO_MS = 30_000;

/**
 * Publica a saúde dos adaptadores desta instância para o painel do administrador (HU39). Cada
 * instância grava o seu retrato; o painel ignora retratos com mais de 2 minutos (instância parada).
 */
export class PublicacaoDaSaudeDasIntegracoes
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  readonly #instancia = `${hostname()}:${String(process.pid)}`;
  #timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly publicar: PublicarSituacaoDasIntegracoes,
    private readonly registros: readonly RegistroDeAdaptadores[],
  ) {}

  onApplicationBootstrap(): void {
    this.#timer = setInterval(() => void this.publicarAgora(), INTERVALO_DO_RETRATO_MS);
    this.#timer.unref();
    void this.publicarAgora();
  }

  onApplicationShutdown(): void {
    clearInterval(this.#timer);
  }

  /** Falha vira log de erro (e alerta): o painel mostra a instância como sumida. */
  async publicarAgora(): Promise<void> {
    try {
      await this.publicar.executar(
        this.#instancia,
        this.registros.flatMap((r) => r.situacao()),
      );
    } catch (erro) {
      registrarErro(
        logger,
        erro,
        'falha ao publicar a saúde das integrações',
        'worker.integracoes',
      );
    }
  }
}
