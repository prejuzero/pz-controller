import { criarConfigVitest } from '@pz/config/vitest';

// Só a lógica do app (src/**/*.ts) roda no Vitest; telas e componentes nativos (.tsx) esperam a
// decisão do runner de componentes (ADR-017, docs/arquitetura/mobile.md, seção 3).
export default criarConfigVitest();
