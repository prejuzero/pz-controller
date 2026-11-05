import { err, hoje, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { contadorDeDiasUteis } from './dias-uteis.js';
import { prazoListado } from './prazos.js';

import type {
  LocalizadorDoProcesso,
  ProcessosDoCliente,
  RecorteDoPainel,
  RepositorioDePrazos,
} from './portas.js';
import type { PrazoListado } from './prazos.js';
import type { Clock, LocalDate, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Janela do card "próximos 7 dias" (RF31), em dias corridos a partir de amanhã. */
export const PROXIMOS_DIAS = 7;

const Recorte = z.object({
  responsavelId: z.uuid().optional(),
  tribunal: z.string().trim().min(1).max(20).optional(),
  clienteId: z.uuid().optional(),
});
const ConsultaDaLinhaDoTempo = Recorte.extend({
  dias: z.coerce.number().int().min(1).max(90).default(30),
});
const ConsultaDosProximos = Recorte.extend({
  limite: z.coerce.number().int().min(1).max(50).default(10),
});

const validacao = (erro: z.ZodError) =>
  new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));

/**
 * Processos do cliente do filtro global (PZ-338), ou `undefined` sem cliente. Sem a porta, recusa:
 * ignorar o filtro mostraria números de todo o escritório como se fossem do cliente.
 */
export async function processosDoFiltro(
  clienteId: string | undefined,
  doCliente: ProcessosDoCliente | undefined,
): Promise<Result<readonly Uuid[] | undefined, Validacao>> {
  if (clienteId === undefined) return ok(undefined);
  if (doCliente === undefined)
    return err(
      new Validacao([{ campo: 'clienteId', mensagem: 'Filtro por cliente indisponível aqui.' }]),
    );
  return doCliente(clienteId as Uuid);
}

async function recorteDe(
  dados: z.infer<typeof Recorte>,
  doCliente: ProcessosDoCliente | undefined,
): Promise<Result<RecorteDoPainel, Validacao>> {
  const processos = await processosDoFiltro(dados.clienteId, doCliente);
  if (!processos.ok) return processos;
  return ok({
    ...(dados.responsavelId === undefined ? {} : { responsavelId: dados.responsavelId as Uuid }),
    ...(dados.tribunal === undefined ? {} : { tribunal: dados.tribunal }),
    ...(processos.valor === undefined ? {} : { processoIds: processos.valor }),
  });
}

export interface ResumoDosPrazos {
  readonly vencemHoje: number;
  readonly proximos7Dias: number;
  readonly vencidosNaoCumpridos: number;
  readonly aguardandoConfirmacao: number;
  readonly semCienciaConfirmada: number;
}

export interface ProximoPrazo extends PrazoListado {
  /** Do motor, com o calendário do processo; `null` se o calendário não cobre o período. */
  readonly diasUteisRestantes: number | null;
}

/**
 * Indicadores de prazos do dashboard (HU26). Só lê e conta: as datas já vieram do motor, e os
 * dias úteis restantes também saem dele (CLAUDE.md, seção 3).
 */
export class PainelDosPrazos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly prazos: RepositorioDePrazos<Transacao>,
    private readonly relogio: Clock,
    private readonly localizar: LocalizadorDoProcesso,
    /** Filtro por cliente; sem ele, o `clienteId` é recusado. */
    private readonly doCliente?: ProcessosDoCliente,
  ) {}

  async resumo(consulta: unknown): Promise<Result<ResumoDosPrazos, Validacao>> {
    const dados = Recorte.safeParse(consulta);
    if (!dados.success) return err(validacao(dados.error));
    const recorte = await recorteDe(dados.data, this.doCliente);
    if (!recorte.ok) return recorte;
    const dia = hoje(this.relogio);
    return ok(
      await this.unidade.executar((tx) =>
        this.prazos.contarParaOPainel(tx, dia, dia.maisDias(PROXIMOS_DIAS), recorte.valor),
      ),
    );
  }

  async linhaDoTempo(
    consulta: unknown,
  ): Promise<Result<{ data: LocalDate; quantidade: number }[], Validacao>> {
    const dados = ConsultaDaLinhaDoTempo.safeParse(consulta);
    if (!dados.success) return err(validacao(dados.error));
    const recorte = await recorteDe(dados.data, this.doCliente);
    if (!recorte.ok) return recorte;
    const inicio = hoje(this.relogio);
    const fim = inicio.maisDias(dados.data.dias - 1);
    const contagem = await this.unidade.executar((tx) =>
      this.prazos.vencimentosPorDia(tx, inicio, fim, recorte.valor),
    );
    const porDia = new Map(contagem.map((c) => [c.data.paraIso(), c.quantidade]));
    // Todos os dias da janela, com zero onde não vence nada: o gráfico não pula dias.
    return ok(
      Array.from({ length: dados.data.dias }, (_, i) => {
        const data = inicio.maisDias(i);
        return { data, quantidade: porDia.get(data.paraIso()) ?? 0 };
      }),
    );
  }

  async proximos(consulta: unknown): Promise<Result<ProximoPrazo[], Validacao>> {
    const dados = ConsultaDosProximos.safeParse(consulta);
    if (!dados.success) return err(validacao(dados.error));
    const recorte = await recorteDe(dados.data, this.doCliente);
    if (!recorte.ok) return recorte;
    const dia = hoje(this.relogio);
    const prazos = await this.unidade.executar((tx) =>
      this.prazos.abertosAPartirDe(tx, dia, recorte.valor, dados.data.limite),
    );
    const contar = contadorDeDiasUteis(this.localizar, dia);
    return ok(
      await Promise.all(
        prazos.map(async (p) => ({
          ...prazoListado(p.estado),
          diasUteisRestantes: await contar(p),
        })),
      ),
    );
  }
}
