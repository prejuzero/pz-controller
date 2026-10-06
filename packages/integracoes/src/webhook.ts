/** Webhook de entrada como chega ao gateway `/v1/webhooks/{adaptador}`: corpo bruto, sem parse. */
export interface RequisicaoWebhook {
  /** Cabeçalhos em minúsculas. */
  readonly cabecalhos: Readonly<Record<string, string>>;
  /** Corpo exato recebido: a assinatura é calculada sobre os bytes, não sobre o JSON. */
  readonly corpo: Uint8Array;
}

/** Parte do adaptador que recebe webhooks: o gateway delega a ele a verificação (ADR-005). */
export interface ReceptorWebhook {
  /** Assinatura válida? Comparação em tempo constante, segredo fora do código. */
  verificarAssinatura(requisicao: RequisicaoWebhook): Promise<boolean>;
  /** ID do evento no provedor: o mesmo webhook repetido não é processado duas vezes. */
  idExterno(requisicao: RequisicaoWebhook): string;
}
