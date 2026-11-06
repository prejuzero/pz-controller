import type { ResultadoDaVerificacaoCompleta } from '@pz/auditoria';

/**
 * Relatório da verificação completa da trilha (PZ-221), para o terminal depois de uma
 * restauração: só ids de tenant, sequências e motivos (nada do conteúdo da trilha).
 */
export function relatorioDaVerificacao(resultados: readonly ResultadoDaVerificacaoCompleta[]): {
  readonly integra: boolean;
  readonly texto: string;
} {
  const divergentes = resultados.filter((r) => r.situacao === 'divergente');
  const registros = resultados.reduce(
    (t, r) => t + (r.situacao === 'integra' ? r.registros : 0),
    0,
  );
  const linhas = [
    `Trilha de auditoria: ${String(resultados.length)} tenant(s), ${String(registros)} registro(s) íntegros.`,
    ...divergentes.map(
      (r) => `DIVERGENTE tenant ${r.tenantId} na sequência ${String(r.sequencia)}: ${r.motivo}`,
    ),
    divergentes.length === 0 ? 'Cadeia íntegra em todos os tenants.' : 'Cadeia NÃO íntegra.',
  ];
  return { integra: divergentes.length === 0, texto: `${linhas.join('\n')}\n` };
}
