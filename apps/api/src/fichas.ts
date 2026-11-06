/** Fichas de injeção da api (tokens do container do NestJS). */
export const AMBIENTE = Symbol('AMBIENTE');
export const RELOGIO = Symbol('RELOGIO');
export const VERIFICADORES = Symbol('VERIFICADORES');
/** Gateway de webhooks (HU09): onde gravar e quem verifica a assinatura de cada adaptador. */
export const CAIXA_DE_WEBHOOKS = Symbol('CAIXA_DE_WEBHOOKS');
export const RECEPTORES_DE_WEBHOOK = Symbol('RECEPTORES_DE_WEBHOOK');
/** Janela deslizante do rate limit por IP (Redis em produção, memória nos testes). */
export const JANELA_DE_REQUISICOES = Symbol('JANELA_DE_REQUISICOES');
/** Filas e DLQs que o painel (Bull Board) mostra (HU07). */
export const FILAS_DO_PAINEL = Symbol('FILAS_DO_PAINEL');
/** Histórico do prazo (HU35): composição auditoria + notificações + prazos + identidade. */
export const HISTORICO_DO_PRAZO = Symbol('HISTORICO_DO_PRAZO');

/** Membros ativos que podem ser responsáveis por prazos (HU41), no tenant da requisição. */
export const RESPONSAVEIS_DA_EQUIPE = Symbol('RESPONSAVEIS_DA_EQUIPE');
export type ResponsaveisDaEquipe = () => Promise<{ usuarioId: string; nome: string }[]>;
