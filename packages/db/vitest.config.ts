import { criarConfigVitest } from '@pz/config/vitest';

// O código gerado pelo Prisma e o CLI de reversão ficam fora da cobertura unitária; o banco é
// coberto pelos testes de integração (Testcontainers).
export default criarConfigVitest({
  pontosDeEntrada: ['src/gerado/**', 'src/reverter.ts', 'src/teste/**'],
});
