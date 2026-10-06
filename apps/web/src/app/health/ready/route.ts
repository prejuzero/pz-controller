// Readiness: o portal não tem dependências próprias. A API fica de fora de propósito: com ela fora
// do ar o portal continua servindo as páginas e mostra o erro, em vez de sair do balanceador.
export { dynamic, GET } from '../live/route';
