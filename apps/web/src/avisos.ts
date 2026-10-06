import type { SessaoAtual } from '@pz/contracts';

/**
 * Avisos da faixa do topo (HU23). A impersonação vem da sessão (HU07); captura atrasada e ciência
 * pendente entram quando a API expuser esses estados (captura na HU17, ciência na HU33).
 */
export type Aviso =
  | { tipo: 'impersonacao'; motivo: string; expiraEm: string }
  | { tipo: 'captura-atrasada' }
  | { tipo: 'ciencia-pendente'; quantidade: number };

export function avisosDaSessao(sessao: Pick<SessaoAtual, 'impersonacao'>): Aviso[] {
  const { impersonacao } = sessao;
  if (impersonacao === null || impersonacao === undefined) return [];
  return [{ tipo: 'impersonacao', motivo: impersonacao.motivo, expiraEm: impersonacao.expiraEm }];
}
