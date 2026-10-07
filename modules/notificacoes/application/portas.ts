import type { MensagemRenderizada } from './templates.js';
import type { CanalComConsentimento, ConsentimentoCanal } from '../domain/consentimento.js';
import type { Canal, Notificacao, TipoDeNotificacao } from '../domain/notificacao.js';
import type { CapacidadesCanal, ResultadoEnvio } from '@pz/integracoes';
import type { Instant, Uuid } from '@pz/kernel';

/** Porta: notificações do tenant da transação (tabela `notificacao`, RLS). */
export interface RepositorioDeNotificacoes<Transacao> {
  /** `false` se a chave de idempotência já existe: a notificação já foi pedida. */
  inserir(transacao: Transacao, notificacao: Notificacao): Promise<boolean>;
  buscar(transacao: Transacao, id: Uuid): Promise<Notificacao | undefined>;
  registrarEnvio(transacao: Transacao, notificacao: Notificacao): Promise<void>;
  /** Pelo ID do envio no provedor; a transação do webhook é global (tenant ainda desconhecido). */
  buscarPorIdExterno(transacao: Transacao, idExterno: string): Promise<Notificacao | undefined>;
  registrarDesfecho(transacao: Transacao, notificacao: Notificacao): Promise<void>;
  /** Quantos usuários do tenant tiveram notificação rejeitada desde o instante (aviso à equipe). */
  usuariosComRejeicaoDesde(transacao: Transacao, desde: Instant): Promise<number>;
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
  emails(
    transacao: Transacao,
    usuarioId: Uuid,
  ): Promise<{ principal?: string; copias: readonly string[] }>;
}

/** Porta: endereços que rejeitaram ou marcaram spam (globais, HU30). */
export interface ListaDeSupressao<Transacao> {
  suprimidos(transacao: Transacao, emails: readonly string[]): Promise<ReadonlySet<string>>;
  /** Inclui os endereços (repetido não muda nada: o primeiro motivo vale). */
  suprimir(
    transacao: Transacao,
    emails: readonly string[],
    motivo: 'bounce' | 'spam',
  ): Promise<void>;
}

/** Porta: consentimentos do tenant da transação (tabela `consentimento_canal`, RLS). */
export interface RepositorioDeConsentimentos<Transacao> {
  ativos(transacao: Transacao, usuarioId: Uuid): Promise<ConsentimentoCanal[]>;
  buscar(transacao: Transacao, id: Uuid): Promise<ConsentimentoCanal | undefined>;
  /** `false` se já há consentimento ativo para o mesmo canal e destino (pedido concorrente). */
  inserir(transacao: Transacao, consentimento: ConsentimentoCanal): Promise<boolean>;
  registrarRevogacao(transacao: Transacao, consentimento: ConsentimentoCanal): Promise<void>;
  /**
   * Endereços de envio com consentimento ativo: tokens dos destinos de push ativos dos
   * dispositivos consentidos; telefones no WhatsApp e no SMS.
   */
  enderecos(
    transacao: Transacao,
    usuarioId: Uuid,
    canal: CanalComConsentimento,
  ): Promise<readonly string[]>;
}

export interface DestinoPushNovo {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly dispositivoId: Uuid;
  readonly plataforma: 'ios' | 'android' | 'web';
  readonly token: string;
}

/** Porta: destinos de push por dispositivo (tabela `destino_push`, RLS). */
export interface RepositorioDeDestinosPush<Transacao> {
  /** Cria ou atualiza o destino do dispositivo (token novo reativa); devolve o ID. */
  gravar(transacao: Transacao, destino: DestinoPushNovo, id: Uuid): Promise<Uuid>;
  /** Desativa o destino do dispositivo do usuário; devolve o ID, se havia um ativo. */
  desativar(transacao: Transacao, usuarioId: Uuid, dispositivoId: Uuid): Promise<Uuid | undefined>;
}

/** Envio num canal (e-mail sobre o ProvedorEmail; push, WhatsApp e SMS sobre CanalNotificacao). */
export interface EnviadorDeCanal {
  /** Capacidades do descritor do canal (obrigatórias fora do e-mail): moldam a renderização. */
  readonly capacidades?: CapacidadesCanal;
  enviar(envio: {
    idempotencia: string;
    destinatarios: readonly string[];
    mensagem: MensagemRenderizada;
  }): Promise<ResultadoEnvio>;
}
