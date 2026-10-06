import type { Cifra } from './portas.js';
import type { ProvedorEmail } from '@pz/integracoes';
import type { EventoDominio, Uuid } from '@pz/kernel';

/** E-mail do usuário, lido na transação do consumidor (tenant do evento). */
export interface EmailsDosUsuarios<Transacao> {
  emailDe(transacao: Transacao, usuarioId: Uuid): Promise<string | undefined>;
}

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

/**
 * E-mails de segurança da conta (HU06). Sem dados de processos; o link leva o token no
 * fragmento (#), que o navegador não envia ao servidor nem em Referer. Idempotência pelo ID do
 * evento: reprocessar o evento reenvia com a mesma chave.
 */
export class EnviarAvisosDeSeguranca<Transacao> {
  constructor(
    private readonly email: ProvedorEmail,
    private readonly emails: EmailsDosUsuarios<Transacao>,
    private readonly cifra: Cifra,
    private readonly urlDoPortal: string,
  ) {}

  async redefinicaoSolicitada(
    transacao: Transacao,
    evento: EventoDominio<
      'RedefinicaoDeSenhaSolicitada',
      { usuarioId: Uuid; tokenCifrado: string }
    >,
  ): Promise<void> {
    const para = await this.emails.emailDe(transacao, evento.payload.usuarioId);
    if (para === undefined) return;
    const link = `${this.urlDoPortal}/redefinir-senha#token=${this.cifra.decifrar(evento.payload.tokenCifrado)}`;
    await this.email.enviar({
      idempotencia: evento.id,
      para: [para],
      assunto: 'Redefinição de senha do PrejuZero',
      texto: `Recebemos um pedido para redefinir a sua senha. Para criar uma nova, acesse em até 30 minutos: ${link}\n\nSe não foi você, ignore este e-mail: a senha atual continua valendo.`,
      html: `<p>Recebemos um pedido para redefinir a sua senha.</p><p><a href="${escapar(link)}">Criar uma nova senha</a> (válido por 30 minutos).</p><p>Se não foi você, ignore este e-mail: a senha atual continua valendo.</p>`,
    });
  }

  async contaBloqueada(
    transacao: Transacao,
    evento: EventoDominio<
      'ContaBloqueada',
      { usuarioId: Uuid; motivo: 'login' | 'segundo-fator'; bloqueadaAte: string }
    >,
  ): Promise<void> {
    const para = await this.emails.emailDe(transacao, evento.payload.usuarioId);
    if (para === undefined) return;
    const oQue = evento.payload.motivo === 'login' ? 'senha' : 'código de verificação (2FA)';
    await this.email.enviar({
      idempotencia: evento.id,
      para: [para],
      assunto: 'Sua conta do PrejuZero foi bloqueada temporariamente',
      texto: `Houve várias tentativas com ${oQue} errado na sua conta e o acesso foi bloqueado temporariamente por segurança. Se não foi você, redefina a sua senha: ${this.urlDoPortal}/recuperar-senha`,
      html: `<p>Houve várias tentativas com ${oQue} errado na sua conta e o acesso foi bloqueado temporariamente por segurança.</p><p>Se não foi você, <a href="${escapar(`${this.urlDoPortal}/recuperar-senha`)}">redefina a sua senha</a>.</p>`,
    });
  }
}
