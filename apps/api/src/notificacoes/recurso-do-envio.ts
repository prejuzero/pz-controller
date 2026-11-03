import type { Uuid } from '@pz/kernel';
import type { RecursoDoEnvioExiste } from '@pz/notificacoes';

interface Busca<Transacao, T> {
  buscar(transacao: Transacao, id: Uuid): Promise<T | undefined>;
}

/**
 * O recurso do envio manual (HU32) existe no tenant da transação (RLS)? Composição pelos
 * repositórios públicos de cada módulo; o relatório, só para quem o pediu.
 */
export function recursoDoEnvioExiste<Transacao>(r: {
  prazos: Busca<Transacao, unknown>;
  publicacoes: Busca<Transacao, unknown>;
  relatorios: Busca<Transacao, { usuarioId: Uuid }>;
}): RecursoDoEnvioExiste<Transacao> {
  return async (tx, recurso, id, usuarioId) => {
    if (recurso === 'prazo') return (await r.prazos.buscar(tx, id)) !== undefined;
    if (recurso === 'publicacao') return (await r.publicacoes.buscar(tx, id)) !== undefined;
    return (await r.relatorios.buscar(tx, id))?.usuarioId === usuarioId;
  };
}
