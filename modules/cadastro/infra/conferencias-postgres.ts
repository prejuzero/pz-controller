import { Instant } from '@pz/kernel';

import type {
  ConferenciaRegistrada,
  ProcessoParaConferir,
  RepositorioDeConferencias,
  TenantsComConferencia,
} from '../application/conferencias.js';
import type { ResultadoDaConferencia } from '../domain/conferencia.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

const instante = (data: Date) => Instant.deEpochMs(data.getTime());
/** Sigiloso ou fora da cobertura automática (domínio: `exigeConferencia`). */
const EXIGE_CONFERENCIA = {
  OR: [{ sigiloso: true }, { cobertura: { not: 'automatica' as const } }],
};

/** Conferências de painel no tenant da transação (RLS); a tabela só aceita inserção. */
export class ConferenciasPostgres implements RepositorioDeConferencias<Transacao> {
  async existeProcesso(tx: Transacao, processoId: Uuid): Promise<boolean> {
    return (await tx.processo.count({ where: { id: processoId } })) > 0;
  }

  async inserir(tx: Transacao, c: ConferenciaRegistrada): Promise<void> {
    await tx.conferenciaPainel.create({
      data: {
        id: c.id,
        tenantId: c.tenantId,
        processoId: c.processoId,
        usuarioId: c.usuarioId,
        realizadaEm: new Date(c.realizadaEm.epochMs),
        resultado: c.resultado,
        observacao: c.observacao,
      },
    });
  }

  async paraConferir(tx: Transacao): Promise<ProcessoParaConferir[]> {
    const linhas = await tx.processo.findMany({
      where: EXIGE_CONFERENCIA,
      select: {
        id: true,
        numeroCnj: true,
        tribunal: true,
        cobertura: true,
        sigiloso: true,
        conferenciaACadaDias: true,
        criadoEm: true,
        conferencias: {
          orderBy: { realizadaEm: 'desc' },
          take: 1,
          select: { realizadaEm: true, resultado: true },
        },
      },
    });
    return linhas.map((l) => {
      const ultima = l.conferencias[0];
      return {
        processoId: l.id as Uuid,
        numeroCnj: l.numeroCnj,
        tribunal: l.tribunal,
        cobertura: l.cobertura,
        sigiloso: l.sigiloso,
        periodicidade: l.conferenciaACadaDias,
        desde: instante(l.criadoEm),
        ultima:
          ultima === undefined
            ? null
            : {
                realizadaEm: instante(ultima.realizadaEm),
                // CHECK da tabela garante o valor.
                resultado: ultima.resultado as ResultadoDaConferencia,
              },
      };
    });
  }
}

/** Tenants com processo que exige conferência (transação do papel sistema). */
export class TenantsComConferenciaPostgres implements TenantsComConferencia<Transacao> {
  async listar(tx: Transacao): Promise<Uuid[]> {
    const linhas = await tx.processo.findMany({
      where: EXIGE_CONFERENCIA,
      distinct: ['tenantId'],
      select: { tenantId: true },
    });
    return linhas.map((l) => l.tenantId as Uuid);
  }
}
