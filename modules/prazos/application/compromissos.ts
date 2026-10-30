import { Conflito, err, gerarUuidV7, Instant, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import type { AutorDoCadastro } from './ciclo-de-vida.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, EventoDominio, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Compromisso do escritório (HU25): audiência, reunião; lembretes em minutos antes. */
export interface Compromisso {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly titulo: string;
  readonly dataHora: Instant;
  readonly local: string | null;
  readonly processoId: Uuid | null;
  readonly lembretesMinutos: readonly number[];
  readonly criadoPor: Uuid;
  readonly canceladoEm: Instant | null;
  readonly motivoCancelamento: string | null;
}

/** Porta: compromissos do tenant da transação (tabela `compromisso`, RLS, sem DELETE). */
export interface RepositorioDeCompromissos<Transacao> {
  inserir(transacao: Transacao, compromisso: Compromisso): Promise<void>;
  buscar(transacao: Transacao, id: Uuid): Promise<Compromisso | undefined>;
  /** `false` se já estava cancelado. */
  cancelar(transacao: Transacao, compromisso: Compromisso): Promise<boolean>;
  /** Não cancelados no período (inclusivo), por data e hora. */
  doPeriodo(
    transacao: Transacao,
    de: Instant,
    ate: Instant,
    limite: number,
  ): Promise<Compromisso[]>;
}

/** Porta: o processo existe no tenant corrente (cadastro). */
export type ProcessoExiste = (processoId: Uuid) => Promise<boolean>;

/** Data e hora sempre com fuso explícito: um horário sem fuso é ambíguo (ADR-013). */
const DataHora = z.iso.datetime({ offset: true });
const UM_ANO_EM_MINUTOS = 525_600;

export const EntradaDoCompromisso = z
  .object({
    titulo: z.string().trim().min(1).max(200),
    dataHora: DataHora,
    local: z.string().trim().max(300).optional(),
    processoId: z.uuid().optional(),
    lembretesMinutos: z
      .array(z.number().int().positive().max(UM_ANO_EM_MINUTOS))
      .max(5)
      .default([1440, 60]),
  })
  .strict();

export const EntradaDoPeriodo = z
  .object({
    de: DataHora,
    ate: DataHora,
    limite: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();

const validacao = (erro: z.ZodError) =>
  new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));

export function compromissoListado(c: Compromisso) {
  return {
    id: c.id,
    titulo: c.titulo,
    dataHora: c.dataHora.paraIso(),
    local: c.local,
    processoId: c.processoId,
    lembretesMinutos: [...c.lembretesMinutos],
    criadoPor: c.criadoPor,
    canceladoEm: c.canceladoEm?.paraIso() ?? null,
    motivoCancelamento: c.motivoCancelamento,
  };
}
export type CompromissoListado = ReturnType<typeof compromissoListado>;

interface Dependencias<Transacao> {
  readonly unidade: UnidadeDeTrabalho<Transacao>;
  readonly compromissos: RepositorioDeCompromissos<Transacao>;
  readonly trilha: TrilhaDeAuditoria<Transacao>;
  readonly outbox: Outbox<Transacao>;
  readonly relogio: Clock;
}

const evento = (
  relogio: Clock,
  tipo: string,
  c: Compromisso,
  payload: Record<string, unknown>,
): EventoDominio => ({
  id: gerarUuidV7(relogio),
  tipo,
  versao: 1,
  tenantId: c.tenantId,
  agregadoId: c.id,
  ocorridoEm: relogio.agora(),
  payload: { compromissoId: c.id, ...payload },
});

/** POST /v1/compromissos (HU25, RF90): com trilha e CompromissoAgendado (lembretes da HU31). */
export class AgendarCompromisso<Transacao> {
  constructor(
    private readonly deps: Dependencias<Transacao>,
    private readonly processoExiste: ProcessoExiste,
  ) {}

  async executar(
    autor: AutorDoCadastro,
    entrada: unknown,
  ): Promise<Result<CompromissoListado, Validacao | NaoEncontrado>> {
    const dados = EntradaDoCompromisso.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const d = dados.data;
    if (d.processoId !== undefined && !(await this.processoExiste(d.processoId as Uuid))) {
      return err(new NaoEncontrado('processo-inexistente', 'Processo não encontrado.'));
    }
    const { relogio } = this.deps;
    const c: Compromisso = {
      id: gerarUuidV7(relogio),
      tenantId: autor.tenantId,
      titulo: d.titulo,
      dataHora: Instant.deIso(d.dataHora),
      local: d.local === undefined || d.local === '' ? null : d.local,
      processoId: (d.processoId as Uuid | undefined) ?? null,
      lembretesMinutos: [...new Set(d.lembretesMinutos)].sort((a, b) => b - a),
      criadoPor: autor.usuarioId,
      canceladoEm: null,
      motivoCancelamento: null,
    };
    return this.deps.unidade.executar(async (tx) => {
      await this.deps.compromissos.inserir(tx, c);
      const depois = compromissoListado(c);
      await this.deps.trilha.registrar(
        tx,
        { tipo: 'prazos.compromisso-agendado', entidade: 'compromisso', entidadeId: c.id, depois },
        { canal: autor.canal, usuarioId: autor.usuarioId },
      );
      await this.deps.outbox.gravar(tx, [
        evento(relogio, 'CompromissoAgendado', c, {
          dataHora: depois.dataHora,
          processoId: c.processoId,
          lembretesMinutos: depois.lembretesMinutos,
        }),
      ]);
      return ok(depois);
    });
  }
}

/** POST /v1/compromissos/{id}/cancelar: com motivo, trilha e CompromissoCancelado. */
export class CancelarCompromisso<Transacao> {
  constructor(private readonly deps: Dependencias<Transacao>) {}

  async executar(
    autor: AutorDoCadastro,
    id: Uuid,
    entrada: unknown,
  ): Promise<Result<CompromissoListado, Validacao | NaoEncontrado | Conflito>> {
    const dados = z
      .object({ motivo: z.string().trim().min(10).max(1000) })
      .strict()
      .safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const { relogio } = this.deps;
    return this.deps.unidade.executar(async (tx) => {
      const atual = await this.deps.compromissos.buscar(tx, id);
      if (atual === undefined) {
        return err(new NaoEncontrado('compromisso-inexistente', 'Compromisso não encontrado.'));
      }
      const cancelado: Compromisso = {
        ...atual,
        canceladoEm: relogio.agora(),
        motivoCancelamento: dados.data.motivo,
      };
      if (atual.canceladoEm !== null || !(await this.deps.compromissos.cancelar(tx, cancelado))) {
        return err(new Conflito('compromisso-ja-cancelado', 'Este compromisso já foi cancelado.'));
      }
      const depois = compromissoListado(cancelado);
      await this.deps.trilha.registrar(
        tx,
        {
          tipo: 'prazos.compromisso-cancelado',
          entidade: 'compromisso',
          entidadeId: id,
          antes: compromissoListado(atual),
          depois,
        },
        { canal: autor.canal, usuarioId: autor.usuarioId },
      );
      await this.deps.outbox.gravar(tx, [
        evento(relogio, 'CompromissoCancelado', cancelado, { motivo: dados.data.motivo }),
      ]);
      return ok(depois);
    });
  }
}

/** GET /v1/compromissos?de&ate: agenda do escritório no período. */
export class ListarCompromissos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly compromissos: RepositorioDeCompromissos<Transacao>,
  ) {}

  async executar(consulta: unknown): Promise<Result<CompromissoListado[], Validacao>> {
    const dados = EntradaDoPeriodo.safeParse(consulta);
    if (!dados.success) return err(validacao(dados.error));
    const de = Instant.deIso(dados.data.de);
    const ate = Instant.deIso(dados.data.ate);
    if (ate.ehAntesDe(de)) {
      return err(new Validacao([{ campo: 'ate', mensagem: 'O fim é anterior ao início.' }]));
    }
    const lista = await this.unidade.executar((tx) =>
      this.compromissos.doPeriodo(tx, de, ate, dados.data.limite),
    );
    return ok(lista.map(compromissoListado));
  }
}
