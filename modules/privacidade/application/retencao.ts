import type { OperacoesDeRetencao } from './portas.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Prazos de retenção em dias (configuração; decisões de 07/10/2026 a confirmar com o jurídico). */
export interface PrazosDeRetencao {
  /** Registros de acesso (login, IP, navegador): 1 ano. */
  readonly acessosDias: number;
  /** Provas pseudonimizadas de escritório encerrado: 5 anos. */
  readonly provasDias: number;
}

const DIA_MS = 24 * 3_600_000;

/**
 * Retenção diária (HU38, job do worker como sistema): expurga as provas dos escritórios
 * encerrados há mais que o prazo (registrando na trilha de cada um, na mesma transação) e os
 * registros de acesso antigos de todos os tenants. A trilha de auditoria não sai por aqui.
 */
export class AplicarRetencao<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly operacoes: OperacoesDeRetencao<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
    private readonly prazos: PrazosDeRetencao,
  ) {}

  async executar(): Promise<{
    readonly tenantsExpurgados: Uuid[];
    readonly acessosExpurgados: number;
  }> {
    const agora = this.relogio.agora();
    const limite = agora.maisMs(-this.prazos.provasDias * DIA_MS);
    const vencidos = await this.unidade.executar((tx) =>
      this.operacoes.encerradosAntesDe(tx, limite),
    );
    for (const tenantId of vencidos) {
      await this.unidade.executar(async (tx) => {
        await this.operacoes.entrarNoTenant(tx, tenantId);
        await this.trilha.registrar(
          tx,
          {
            tipo: 'privacidade.provas-expurgadas',
            entidade: 'tenant',
            entidadeId: tenantId,
            depois: { retencaoDias: this.prazos.provasDias },
          },
          { canal: 'sistema' },
        );
        await this.operacoes.expurgarProvas(tx, tenantId, this.prazos.provasDias);
      });
    }
    const acessosExpurgados = await this.unidade.executar((tx) =>
      this.operacoes.expurgarAcessos(tx, agora.maisMs(-this.prazos.acessosDias * DIA_MS)),
    );
    return { tenantsExpurgados: vencidos, acessosExpurgados };
  }
}
