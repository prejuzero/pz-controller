import type { EntradaDeAuditoria, OrigemDaAuditoria, TrilhaDeAuditoria } from './portas.js';
import type { EventoDominio } from '@pz/kernel';

type Payload = Record<string, string>;

/** Como cada evento de domínio vira registro na trilha (sem dados secretos: nunca o token). */
const MAPA: Readonly<Record<string, (payload: Payload) => EntradaDeAuditoria>> = {
  DispositivoRegistrado: (p) => ({
    tipo: 'identidade.dispositivo-registrado',
    entidade: 'sessao_dispositivo',
    entidadeId: String(p.dispositivoId),
    depois: { tipoCliente: p.tipoCliente },
  }),
  SessaoRevogada: (p) => ({
    tipo: 'identidade.sessao-revogada',
    entidade: 'sessao_dispositivo',
    entidadeId: String(p.dispositivoId),
    depois: { motivo: p.motivo },
  }),
  ContaBloqueada: (p) => ({
    tipo: 'identidade.conta-bloqueada',
    entidade: 'usuario',
    entidadeId: String(p.usuarioId),
    depois: { motivo: p.motivo, bloqueadaAte: p.bloqueadaAte },
  }),
  RedefinicaoDeSenhaSolicitada: (p) => ({
    tipo: 'identidade.redefinicao-de-senha-solicitada',
    entidade: 'usuario',
    entidadeId: String(p.usuarioId),
  }),
  // HU30. Sem o detalhe do provedor: pode trazer o endereço de e-mail (minimização, LGPD).
  NotificacaoRejeitada: (p) => ({
    tipo: 'notificacoes.notificacao-rejeitada',
    entidade: 'notificacao',
    entidadeId: String(p.notificacaoId),
    depois: { canal: p.canal, tipo: p.tipo, motivo: p.motivo },
  }),
  // HU58: correção de sugestão de IA, com a origem (modelo e prompt) para a curadoria.
  SugestaoIaCorrigida: (p) => ({
    tipo: 'ia.sugestao-corrigida',
    entidade: String(p.entidade),
    entidadeId: String(p.entidadeId),
    antes: { campo: p.campo, valor: p.valorSugerido, origemIa: p.origemIa },
    depois: { campo: p.campo, valor: p.valorCorrigido },
  }),
};

export const EVENTOS_AUDITADOS = Object.keys(MAPA);

/** Registra na trilha os eventos de domínio auditados, na transação do consumidor (tenant). */
export class AuditarEvento<Transacao> {
  constructor(private readonly trilha: TrilhaDeAuditoria<Transacao>) {}

  async executar(transacao: Transacao, evento: EventoDominio): Promise<void> {
    const mapear = MAPA[evento.tipo];
    if (mapear === undefined) throw new Error(`Evento ${evento.tipo} sem mapeamento de auditoria`);
    const payload = evento.payload as Payload;
    const origem: OrigemDaAuditoria = {
      canal: 'evento',
      ...(payload.usuarioId === undefined ? {} : { usuarioId: payload.usuarioId }),
    };
    await this.trilha.registrar(transacao, mapear(payload), origem);
  }
}
