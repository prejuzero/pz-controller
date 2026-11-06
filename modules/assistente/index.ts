// API pública do módulo assistente (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export { ferramentasDoAssistente } from './application/ferramentas.js';
export type { FontesDasFerramentas } from './application/ferramentas.js';
export {
  EscolhaDoModelo,
  EscolherFerramenta,
  TAREFA_DE_ESCOLHA,
} from './application/escolher-ferramenta.js';
export type { EscolhaDeFerramenta } from './application/escolher-ferramenta.js';
