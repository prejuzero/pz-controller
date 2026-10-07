import type { AvisosDeEntrega, SessaoAtual } from '@pz/contracts';

/**
 * Avisos da faixa do topo (HU23). A impersonação vem da sessão (HU07); captura atrasada e ciência
 * pendente entram quando a API expuser esses estados (captura na HU17, ciência na HU33).
 */
export type Aviso =
  | { tipo: 'impersonacao'; motivo: string; expiraEm: string }
  | { tipo: 'captura-atrasada' }
  | { tipo: 'ciencia-pendente'; quantidade: number }
  | { tipo: 'email-rejeitado'; emails: readonly string[] }
  | { tipo: 'equipe-com-rejeicao'; quantidade: number };

export function avisosDaSessao(sessao: Pick<SessaoAtual, 'impersonacao'>): Aviso[] {
  const { impersonacao } = sessao;
  if (impersonacao === null || impersonacao === undefined) return [];
  return [{ tipo: 'impersonacao', motivo: impersonacao.motivo, expiraEm: impersonacao.expiraEm }];
}

/**
 * Rejeição de e-mail (HU30): o usuário vê os próprios endereços suprimidos (não recebem nada);
 * quem administra a equipe vê quantos colegas tiveram rejeição na última semana.
 */
export function avisosDeEntrega(avisos: AvisosDeEntrega): Aviso[] {
  const resultado: Aviso[] = [];
  if (avisos.emailsRejeitados.length > 0)
    resultado.push({ tipo: 'email-rejeitado', emails: avisos.emailsRejeitados });
  const equipe = avisos.usuariosDaEquipeComRejeicao;
  if (equipe !== null && equipe > 0)
    resultado.push({ tipo: 'equipe-com-rejeicao', quantidade: equipe });
  return resultado;
}
