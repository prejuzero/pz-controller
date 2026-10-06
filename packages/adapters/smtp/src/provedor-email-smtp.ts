import { definirDescritor, EmailCanonico, ErroPermanente } from '@pz/integracoes';
import { createTransport } from 'nodemailer';

import { classificarErroSmtp } from './erros.js';

import type { ProvedorEmail, ResultadoEnvio, SaudeAdaptador } from '@pz/integracoes';
import type { Clock } from '@pz/kernel';
import type { Transporter } from 'nodemailer';

export const DESCRITOR_SMTP = definirDescritor({
  id: 'smtp',
  porta: 'provedor-email',
  versao: '1.0.0',
  capacidades: { html: true, textoPuro: true, webhooksDeEntrega: false },
  limites: { concorrencia: 5, timeoutMs: 15_000 },
  requerCredenciais: false,
});

export interface ConfiguracaoSmtp {
  readonly host: string;
  readonly porta: number;
  /** TLS desde a conexão (465); sem isso, exige STARTTLS fora do ambiente local. */
  readonly tls: boolean;
  readonly exigirStartTls: boolean;
  readonly usuario?: string;
  readonly senha?: string;
  /** Remetente, ex.: `PrejuZero <nao-responda@prejuzero.com.br>`. */
  readonly remetente: string;
}

/**
 * `ProvedorEmail` por SMTP (ADR-005): Mailpit no ambiente local, qualquer relay SMTP (inclusive
 * o do SES) em produção. Retentativa, timeout e circuit breaker ficam com o registro.
 */
export class ProvedorEmailSmtp implements ProvedorEmail {
  readonly #transporte: Transporter;

  constructor(
    config: ConfiguracaoSmtp,
    private readonly relogio: Clock,
  ) {
    this.#remetente = config.remetente;
    this.#transporte = createTransport({
      host: config.host,
      port: config.porta,
      secure: config.tls,
      requireTLS: config.exigirStartTls,
      ...(config.usuario === undefined || config.senha === undefined
        ? {}
        : { auth: { user: config.usuario, pass: config.senha } }),
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  readonly #remetente: string;

  async enviar(email: EmailCanonico): Promise<ResultadoEnvio> {
    const valido = EmailCanonico.safeParse(email);
    if (!valido.success) throw new ErroPermanente('e-mail fora do modelo canônico', 'smtp');
    try {
      const info = await this.#transporte.sendMail({
        from: this.#remetente,
        to: [...valido.data.para],
        subject: valido.data.assunto,
        html: valido.data.html,
        text: valido.data.texto,
        // Correlaciona reenvios do mesmo e-mail (idempotência do lado de quem lê os eventos).
        headers: { 'X-PZ-Idempotencia': valido.data.idempotencia },
      });
      return { idExterno: info.messageId, aceitoEm: this.relogio.agora() };
    } catch (erro) {
      throw classificarErroSmtp(erro);
    }
  }

  async saude(): Promise<SaudeAdaptador> {
    try {
      await this.#transporte.verify();
      return { estado: 'operacional', verificadoEm: this.relogio.agora() };
    } catch (erro) {
      return {
        estado: 'indisponivel',
        verificadoEm: this.relogio.agora(),
        detalhe: classificarErroSmtp(erro).message,
      };
    }
  }

  encerrar(): void {
    this.#transporte.close();
  }
}
