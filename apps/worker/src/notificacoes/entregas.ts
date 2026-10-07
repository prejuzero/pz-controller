import { criarLogger, registrarRejeicaoEmail } from '@pz/observability';

import type { ProcessadorDeWebhook } from '../integracoes/webhooks.js';
import type { Transacao } from '@pz/db';
import type { EventoEntrega } from '@pz/integracoes';
import type { RegistrarDesfechosDeEntrega } from '@pz/notificacoes';

const logger = criarLogger('worker.notificacoes');

/** Rejeições que contam para o alerta "Rejeição de e-mail" ao administrador (HU30). */
const MOTIVO_DA_METRICA: Partial<Record<EventoEntrega['tipo'], string>> = {
  rejeitado: 'bounce',
  reclamacao: 'spam',
  falhou: 'falha',
};

/**
 * Liga o webhook de entrega de um provedor de e-mail ao caso de uso (HU30). Sem regra aqui:
 * interpreta pelo adaptador, aplica pelo módulo e registra métrica e log.
 */
export function processadorDeEntregas(
  interpretar: (webhook: Parameters<ProcessadorDeWebhook>[1]) => Promise<EventoEntrega[]>,
  desfechos: RegistrarDesfechosDeEntrega<Transacao>,
): ProcessadorDeWebhook {
  return async (tx, webhook) => {
    const eventos = await interpretar(webhook);
    const resumo = await desfechos.executar(tx, eventos);
    for (const evento of eventos) {
      const motivo = MOTIVO_DA_METRICA[evento.tipo];
      if (motivo !== undefined) registrarRejeicaoEmail(motivo);
    }
    if (resumo.semNotificacao > 0) {
      // Ex.: aviso de segurança, enviado fora da tabela de notificações; a supressão já valeu.
      logger.info(
        { adaptador: webhook.adaptador, quantidade: resumo.semNotificacao },
        'eventos de entrega sem notificação correspondente',
      );
    }
  };
}
