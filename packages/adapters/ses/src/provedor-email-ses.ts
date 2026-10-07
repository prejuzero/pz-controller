import { ProvedorEmailSmtp } from '@pz/adapter-smtp';
import { definirDescritor } from '@pz/integracoes';

import type { Clock } from '@pz/kernel';

export const DESCRITOR_SES = definirDescritor({
  id: 'ses',
  porta: 'provedor-email',
  versao: '1.0.0',
  capacidades: { html: true, textoPuro: true, webhooksDeEntrega: true },
  limites: { concorrencia: 5, timeoutMs: 15_000 },
  requerCredenciais: true,
});

export interface ConfiguracaoSes {
  /** Região do SES, ex.: `sa-east-1`. */
  readonly regiao: string;
  /** Credenciais SMTP do SES (não são as chaves de acesso da AWS). */
  readonly usuario: string;
  readonly senha: string;
  readonly remetente: string;
  /** Só para o kit de contrato apontar para um servidor de teste. */
  readonly endpoint?: { readonly host: string; readonly porta: number; readonly tls: boolean };
}

/**
 * `ProvedorEmail` pelo SES, pela interface SMTP do serviço (porta 587 com STARTTLS obrigatório).
 * Sem SDK da AWS: o envio reaproveita o adaptador SMTP. O SES devolve o `Message-ID` original nos
 * eventos de entrega (`mail.commonHeaders.messageId`), que correlaciona com o `idExterno` do envio.
 */
export function criarProvedorEmailSes(config: ConfiguracaoSes, relogio: Clock): ProvedorEmailSmtp {
  const endpoint = config.endpoint ?? {
    host: `email-smtp.${config.regiao}.amazonaws.com`,
    porta: 587,
    tls: false,
  };
  return new ProvedorEmailSmtp(
    {
      host: endpoint.host,
      porta: endpoint.porta,
      tls: endpoint.tls,
      exigirStartTls: config.endpoint === undefined,
      usuario: config.usuario,
      senha: config.senha,
      remetente: config.remetente,
    },
    relogio,
  );
}
