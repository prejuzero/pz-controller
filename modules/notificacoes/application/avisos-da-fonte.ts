import { FUSO_PADRAO } from '@pz/kernel';

import type { Notificar } from './notificacoes.js';
import type { ResponsaveisDoEscritorio } from './portas.js';
import type { Instant, Uuid } from '@pz/kernel';

export interface SituacaoDaFonte {
  /** ID do evento da captura: janela da idempotência (reprocessar não avisa de novo). */
  readonly eventoId: Uuid;
  readonly tenantId: Uuid;
  readonly fonte: string;
  readonly situacao: 'degradada' | 'restabelecida';
  readonly ocorridoEm: Instant;
}

/** Página do portal que mostra a cobertura e a situação de cada fonte (HU19). */
const PAGINA_DA_COBERTURA = '/configuracoes/cobertura';

/**
 * Avisa por e-mail quem administra o escritório que a captura de uma fonte degradou ou voltou
 * (HU19, PZ-311): sem a captura, novas intimações podem não chegar e o diário precisa ser
 * conferido à mão (transparência de cobertura). A faixa do portal já mostra o estado; o e-mail
 * alcança quem não está com o portal aberto. Devolve quantos avisos foram pedidos.
 */
export class AvisarSituacaoDaFonte<Transacao> {
  constructor(
    private readonly notificar: Notificar<Transacao>,
    private readonly responsaveis: ResponsaveisDoEscritorio<Transacao>,
    private readonly urlDoPortal: string,
  ) {}

  async executar(transacao: Transacao, s: SituacaoDaFonte): Promise<number> {
    const quando = formatarDataHora(s.ocorridoEm);
    const fonte = s.fonte.toUpperCase();
    const link = new URL(PAGINA_DA_COBERTURA, this.urlDoPortal).toString();
    const [tipo, dados] =
      s.situacao === 'degradada'
        ? (['fonte-degradada', { fonte, desde: quando, link }] as const)
        : (['fonte-restabelecida', { fonte, em: quando, link }] as const);
    let pedidos = 0;
    for (const usuarioId of await this.responsaveis.usuarios(transacao)) {
      const resultado = await this.notificar.executar(transacao, {
        tipo,
        tenantId: s.tenantId,
        usuarioId,
        janela: s.eventoId,
        dados,
      });
      // Dados montados aqui: inválido é defeito, não entrada do usuário (vai para a DLQ).
      if (!resultado.ok) throw resultado.erro;
      if (resultado.valor.solicitada) pedidos += 1;
    }
    return pedidos;
  }
}

const FORMATO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_PADRAO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "DD/MM/AAAA HH:MM" no fuso do sistema (ADR-013); o pt-BR separa data e hora com vírgula. */
const formatarDataHora = (instante: Instant): string =>
  FORMATO.format(instante.epochMs).replace(', ', ' ');
