import {
  err,
  formatarNumeroCnj,
  FUSO_PADRAO,
  gerarUuidV7,
  hoje,
  lerNumeroCnj,
  LocalDate,
  NaoEncontrado,
  ok,
} from '@pz/kernel';
import { z } from 'zod';

import {
  PERIODICIDADE_PADRAO,
  RESULTADOS_DA_CONFERENCIA,
  situacaoDaConferencia,
} from '../domain/conferencia.js';

import { origemDe, validacao } from './paginacao.js';

import type { AutorNoTenant } from './paginacao.js';
import type { ResultadoDaConferencia, SituacaoDaConferencia } from '../domain/conferencia.js';
import type { Cobertura } from '../domain/processo.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Instant, Result, UnidadeDeTrabalho, Uuid, Validacao } from '@pz/kernel';

export interface ConferenciaRegistrada {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly processoId: Uuid;
  readonly usuarioId: Uuid;
  readonly realizadaEm: Instant;
  readonly resultado: ResultadoDaConferencia;
  readonly observacao: string | null;
}

/** Processo que exige conferência, com a última conferência (ou a data de início). */
export interface ProcessoParaConferir {
  readonly processoId: Uuid;
  readonly numeroCnj: string;
  readonly tribunal: string | null;
  readonly cobertura: Cobertura;
  readonly sigiloso: boolean;
  readonly periodicidade: number | null;
  /** Sem conferência: o instante em que o processo foi cadastrado. */
  readonly desde: Instant;
  readonly ultima: {
    readonly realizadaEm: Instant;
    readonly resultado: ResultadoDaConferencia;
  } | null;
}

/** Conferências no tenant da transação (RLS); só inserção (prova). */
export interface RepositorioDeConferencias<Transacao> {
  existeProcesso(transacao: Transacao, processoId: Uuid): Promise<boolean>;
  inserir(transacao: Transacao, conferencia: ConferenciaRegistrada): Promise<void>;
  /** Processos sigilosos ou fora da cobertura automática, com a última conferência. */
  paraConferir(transacao: Transacao): Promise<ProcessoParaConferir[]>;
}

export const EntradaDaConferencia = z
  .object({
    resultado: z.enum(RESULTADOS_DA_CONFERENCIA),
    observacao: z.string().trim().max(1000).optional(),
  })
  .strict();

const naoEncontrado = () =>
  new NaoEncontrado('processo-nao-encontrado', 'Processo não encontrado.');

/**
 * Registra a conferência do painel (HU36, RF92): quem, quando (relógio do servidor) e o
 * resultado, com a trilha na mesma transação. "Nova intimação" leva o portal ao cadastro
 * assistido (HU25); o prazo nasce lá, nunca aqui.
 */
export class RegistrarConferencia<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly conferencias: RepositorioDeConferencias<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    autor: AutorNoTenant,
    processoId: Uuid,
    entrada: unknown,
  ): Promise<Result<ConferenciaRegistrada, Validacao | NaoEncontrado>> {
    const dados = EntradaDaConferencia.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    return this.unidade.executar(async (tx) => {
      if (!(await this.conferencias.existeProcesso(tx, processoId))) return err(naoEncontrado());
      const observacao = dados.data.observacao ?? '';
      const conferencia: ConferenciaRegistrada = {
        id: gerarUuidV7(this.relogio),
        tenantId: autor.tenantId,
        processoId,
        usuarioId: autor.usuarioId,
        realizadaEm: this.relogio.agora(),
        resultado: dados.data.resultado,
        observacao: observacao === '' ? null : observacao,
      };
      await this.conferencias.inserir(tx, conferencia);
      await this.trilha.registrar(
        tx,
        {
          tipo: 'cadastro.conferencia-registrada',
          entidade: 'processo',
          entidadeId: processoId,
          // A observação pode trazer teor sigiloso: a trilha guarda só que ela existe.
          depois: {
            conferenciaId: conferencia.id,
            resultado: conferencia.resultado,
            comObservacao: conferencia.observacao !== null,
          },
        },
        origemDe(autor),
      );
      return ok(conferencia);
    });
  }
}

export interface ConferenciaPendente extends SituacaoDaConferencia {
  readonly processoId: Uuid;
  readonly numeroCnj: string;
  readonly tribunal: string | null;
  readonly cobertura: Cobertura;
  readonly sigiloso: boolean;
  readonly periodicidade: number;
  readonly ultimaConferencia: {
    readonly realizadaEm: string;
    readonly resultado: ResultadoDaConferencia;
  } | null;
}

/**
 * Conferências do escritório (HU36): cada processo que exige conferência, com a próxima data e
 * se está atrasada. A ordem põe os atrasados primeiro e, depois, os mais próximos.
 */
export class ConsultarConferencias<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly conferencias: RepositorioDeConferencias<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(): Promise<ConferenciaPendente[]> {
    const lista = await this.unidade.executar((tx) => this.conferencias.paraConferir(tx));
    const dia = hoje(this.relogio);
    return lista
      .map((p) => {
        const periodicidade = p.periodicidade ?? PERIODICIDADE_PADRAO;
        const referencia = LocalDate.doInstante(p.ultima?.realizadaEm ?? p.desde, FUSO_PADRAO);
        return {
          processoId: p.processoId,
          numeroCnj: formatado(p.numeroCnj),
          tribunal: p.tribunal,
          cobertura: p.cobertura,
          sigiloso: p.sigiloso,
          periodicidade,
          ultimaConferencia:
            p.ultima === null
              ? null
              : { realizadaEm: p.ultima.realizadaEm.paraIso(), resultado: p.ultima.resultado },
          ...situacaoDaConferencia(referencia, dia, periodicidade),
        };
      })
      .sort(
        (a, b) =>
          Number(b.atrasada) - Number(a.atrasada) ||
          a.proxima.localeCompare(b.proxima) ||
          a.numeroCnj.localeCompare(b.numeroCnj),
      );
  }
}

/** Tenants com algum processo que exige conferência (papel sistema, com motivo). */
export interface TenantsComConferencia<Transacao> {
  listar(transacao: Transacao): Promise<Uuid[]>;
}

function formatado(digitos: string): string {
  const partes = lerNumeroCnj(digitos);
  return partes === undefined ? digitos : formatarNumeroCnj(partes);
}
