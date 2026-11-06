import { podeVerHistoricoDoPrazo } from '@pz/auditoria';
import { NaoEncontrado, Proibido } from '@pz/kernel';

import type { EventoDoHistorico, LeitorDoHistorico } from '@pz/auditoria';
import type { HistoricoDoPrazo } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';

/** Dependências do histórico (HU35), pelas APIs públicas dos módulos; tenant da sessão (RLS). */
export interface FontesDoHistorico {
  /** O responsável do prazo; `undefined` quando o prazo não existe no tenant. */
  responsavelDoPrazo(prazoId: Uuid): Promise<{ responsavelId: string | null } | undefined>;
  notificacoesDoPrazo(prazoId: Uuid): Promise<readonly Uuid[]>;
  eventos(
    tenantId: Uuid,
    alvos: readonly { entidade: string; entidadeId: string }[],
  ): Promise<EventoDoHistorico[]>;
  nomes(usuarioIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

/**
 * Histórico do prazo (HU35): o prazo e as notificações dele na trilha, com o nome de quem agiu.
 * Só compõe os módulos (auditoria, notificacoes, prazos, identidade); a leitura é da auditoria.
 */
export function historicoDoPrazo(f: FontesDoHistorico) {
  return async (
    tenantId: Uuid,
    prazoId: Uuid,
    leitor: LeitorDoHistorico,
  ): Promise<HistoricoDoPrazo> => {
    const prazo = await f.responsavelDoPrazo(prazoId);
    if (prazo === undefined) throw new NaoEncontrado('prazo-inexistente', 'Prazo não encontrado.');
    // Escopo (HU41, RF88): a regra é do módulo auditoria.
    if (!podeVerHistoricoDoPrazo(leitor, prazo.responsavelId)) {
      throw new Proibido('historico-de-outro', 'O histórico deste prazo é do responsável por ele.');
    }
    const notificacoes = await f.notificacoesDoPrazo(prazoId);
    const eventos = await f.eventos(tenantId, [
      { entidade: 'prazo', entidadeId: prazoId },
      ...notificacoes.map((id) => ({ entidade: 'notificacao', entidadeId: id })),
    ]);
    const nomes = await f.nomes([
      ...new Set(eventos.flatMap((e) => (e.usuarioId === null ? [] : [e.usuarioId]))),
    ]);
    return {
      itens: eventos.map((e) => ({
        sequencia: e.sequencia,
        tipo: e.tipo,
        entidade: e.entidade,
        usuario:
          e.usuarioId === null ? null : { id: e.usuarioId, nome: nomes.get(e.usuarioId) ?? null },
        canal: e.canal,
        criadoEm: e.criadoEm,
        antes: e.antes,
        depois: e.depois,
        hashAnterior: e.hashAnterior,
        hash: e.hash,
      })),
    };
  };
}
