import {
  criarLogger,
  registrarAlvoFalhando,
  registrarErro,
  registrarSituacaoDaFonte,
} from '@pz/observability';

import type { AlertasDaCaptura } from '@pz/captura';

const logger = criarLogger('captura');

/** Alertas da captura à equipe (HU19): métrica (alerta no Grafana) e log. Sem regra aqui. */
export const alertasDaCaptura: AlertasDaCaptura = {
  fonteDegradada(fonte, falhas) {
    registrarSituacaoDaFonte(fonte, true);
    registrarErro(
      logger,
      new Error(`fonte ${fonte} degradada após ${String(falhas)} falhas seguidas`),
      `fonte de publicações ${fonte} degradada`,
      'captura.fonte-degradada',
    );
  },
  fonteRestabelecida(fonte, alvosAntecipados) {
    registrarSituacaoDaFonte(fonte, false);
    logger.info(
      { fonte, alvosAntecipados },
      'fonte de publicações restabelecida: recaptura antecipada',
    );
  },
  alvoFalhando(alvoId, falhas) {
    registrarAlvoFalhando();
    logger.warn(
      { alvoId, falhas, codigo: 'captura.alvo-falhando' },
      'alvo de captura com falhas seguidas',
    );
  },
};
