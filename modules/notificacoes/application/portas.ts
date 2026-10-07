import type { MensagemRenderizada } from './templates.js';
import type { Canal, Notificacao, TipoDeNotificacao } from '../domain/notificacao.js';
import type { ResultadoEnvio } from '@pz/integracoes';
import type { Uuid } from '@pz/kernel';

/** Porta: notificações do tenant da transação (tabela `notificacao`, RLS). */
export interface RepositorioDeNotificacoes<Transacao> {
  /** `false` se a chave de idempotência já existe: a notificação já foi pedida. */
  inserir(transacao: Transacao, notificacao: Notificacao): Promise<boolean>;
  buscar(transacao: Transacao, id: Uuid): Promise<Notificacao | undefined>;
  registrarEnvio(transacao: Transacao, notificacao: Notificacao): Promise<void>;
}

/** Porta: preferência do usuário; `undefined` = sem escolha, vale o padrão (ativo). */
export interface PreferenciasDeNotificacao<Transacao> {
  ativo(
    transacao: Transacao,
    usuarioId: Uuid,
    tipo: TipoDeNotificacao,
    canal: Canal,
  ): Promise<boolean | undefined>;
}

/**
 * Porta: para onde mandar (e-mail do usuário e cópias do cadastro). A composição liga à
 * identidade e ao cadastro pelas APIs públicas deles.
 */
export interface DestinosDoUsuario<Transacao> {
  emails(transacao: Transacao, usuarioId: Uuid): Promise<{ principal?: string; copias: string[] }>;
}

/** Porta: endereços que rejeitaram ou marcaram spam (globais, HU30). */
export interface ListaDeSupressao<Transacao> {
  suprimidos(transacao: Transacao, emails: readonly string[]): Promise<ReadonlySet<string>>;
}

/** Envio num canal (e-mail sobre o ProvedorEmail; push, WhatsApp e SMS sobre CanalNotificacao). */
export interface EnviadorDeCanal {
  enviar(envio: {
    idempotencia: string;
    destinatarios: readonly string[];
    mensagem: MensagemRenderizada;
  }): Promise<ResultadoEnvio>;
}
