import { criarConfigVitest } from '@pz/config/vitest';

// main.ts e instrumentacao.ts: cobertos pelo teste de boot (src/boot.test.ts).
// filas/runtime.ts, filas/servico.ts, eventos/relay.ts e recursos.ts: cobertos pelos testes de
// integração com Redis e PostgreSQL reais.
export default criarConfigVitest({
  foraDaCoberturaUnitaria: [
    'src/main.ts',
    'src/instrumentacao.ts',
    'src/filas/runtime.ts',
    'src/filas/servico.ts',
    'src/eventos/relay.ts',
    'src/recursos.ts',
    'src/integracoes/webhooks.ts',
    // Consumidores de e-mail e auditoria: só ligação, cobertos pelo worker.int.test.ts.
    'src/identidade/consumidor.ts',
    'src/auditoria/consumidor.ts',
    // Ponto de entrada da linha de comando (só compõe): exercitado pelo infra/backup/restaurar.sh.
    'src/auditoria/verificar-cadeia-cli.ts',
    // Fonte dos relatórios: só compõe a busca da HU28; exercitada pelo E2E de relatórios.
    'src/relatorios/fonte.ts',
  ],
});
