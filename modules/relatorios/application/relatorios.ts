import { PedidoDeRelatorio } from '@pz/contracts';
import { err, gerarUuidV7, LocalDate, NaoEncontrado, ok, Validacao } from '@pz/kernel';

import {
  descreverFiltros,
  linhasDaAgenda,
  linhasDaBuscaDePrazos,
  linhasDaBuscaDePublicacoes,
  MAXIMO_DE_LINHAS,
  TITULOS,
} from '../domain/relatorio.js';

import type {
  FonteDosRelatorios,
  Pagina,
  Relatorio,
  Renderizador,
  RepositorioDeRelatorios,
} from './portas.js';
import type { Documento, Formato } from '../domain/relatorio.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { ArmazenamentoArquivos } from '@pz/integracoes';
import type { Clock, Instant, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';
import type { z } from 'zod';

/** O arquivo fica disponível por 24 h (aceite da HU29); cada link assinado vale 15 min. */
const VALIDADE_DO_ARQUIVO_MS = 24 * 3_600_000;
/** Período máximo da agenda: um ano (o teto de linhas também vale). */
const MAXIMO_DIAS_DA_AGENDA = 366;
const RECENTES = 20;
const VALIDADE_DO_LINK_S = 15 * 60;
const FUSO = 'America/Sao_Paulo';

const EXTENSOES: Readonly<Record<Formato, string>> = { pdf: 'pdf', xlsx: 'xlsx' };
export const caminhoDoArquivo = (r: Pick<Relatorio, 'id' | 'formato'>) =>
  `relatorios/${r.id}/relatorio.${EXTENSOES[r.formato]}`;

const validacao = (erro: z.ZodError) =>
  new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));

export interface Solicitante {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
}

/**
 * Pedido de relatório (HU29): valida os filtros, grava o pedido, a trilha (RF62) e o evento que o
 * worker processa, na mesma transação.
 */
export class SolicitarRelatorio<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly relatorios: RepositorioDeRelatorios<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    solicitante: Solicitante,
    entrada: unknown,
  ): Promise<Result<{ id: Uuid }, Validacao>> {
    const lido = PedidoDeRelatorio.esquema.safeParse(entrada);
    if (!lido.success) return err(validacao(lido.error));
    const pedido = lido.data;
    if (pedido.tipo === 'agenda') {
      const de = LocalDate.analisar(pedido.filtros.de);
      const ate = LocalDate.analisar(pedido.filtros.ate);
      // O schema já validou as datas: falha aqui é defeito.
      if (!de.ok || !ate.ok) throw new Error('Data civil inválida após o schema');
      const dias = de.valor.diasAte(ate.valor);
      if (dias < 0) return err(invalido('filtros.ate', 'A data final é anterior à inicial.'));
      if (dias >= MAXIMO_DIAS_DA_AGENDA) {
        return err(invalido('filtros.ate', 'A agenda vai até um ano por relatório.'));
      }
    }
    return this.unidade.executar(async (tx) => {
      const agora = this.relogio.agora();
      const id = gerarUuidV7(this.relogio);
      await this.relatorios.inserir(tx, {
        id,
        tenantId: solicitante.tenantId,
        usuarioId: solicitante.usuarioId,
        tipo: pedido.tipo,
        formato: pedido.formato,
        filtros: pedido.filtros,
        situacao: 'pendente',
        solicitadoEm: agora,
      });
      await this.trilha.registrar(
        tx,
        {
          tipo: 'relatorios.exportacao-solicitada',
          entidade: 'relatorio',
          entidadeId: id,
          depois: { tipo: pedido.tipo, formato: pedido.formato, filtros: pedido.filtros },
        },
        { canal: solicitante.canal, usuarioId: solicitante.usuarioId },
      );
      await this.outbox.gravar(tx, [
        {
          id: gerarUuidV7(this.relogio),
          tipo: 'RelatorioSolicitado',
          versao: 1,
          tenantId: solicitante.tenantId,
          agregadoId: id,
          ocorridoEm: agora,
          payload: { relatorioId: id, usuarioId: solicitante.usuarioId },
        },
      ]);
      return ok({ id });
    });
  }
}

function invalido(campo: string, mensagem: string) {
  return new Validacao([{ campo, mensagem }]);
}

export type ResultadoDaGeracao = 'gerado' | 'ja-concluido' | 'filtros-invalidos';

/**
 * Gera o arquivo (worker, fila relatorios): busca os dados com os filtros do pedido, monta o
 * documento, renderiza, grava no armazenamento e conclui com a trilha. Repetir regrava o mesmo
 * caminho; concluído não é gerado de novo. Filtro recusado pela busca marca "falhou" (não adianta
 * repetir); falha inesperada lança (retentativa e DLQ).
 */
export class GerarRelatorio<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly relatorios: RepositorioDeRelatorios<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly fonte: FonteDosRelatorios,
    private readonly renderizadores: readonly Renderizador[],
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly relogio: Clock,
  ) {}

  async executar(relatorioId: Uuid): Promise<ResultadoDaGeracao> {
    const relatorio = await this.unidade.executar((tx) => this.relatorios.buscar(tx, relatorioId));
    if (relatorio === undefined)
      throw new Error(`Relatório ${relatorioId} não encontrado no tenant`);
    if (relatorio.situacao !== 'pendente') return 'ja-concluido';
    const renderizador = this.renderizadores.find((r) => r.formato === relatorio.formato);
    if (renderizador === undefined) throw new Error(`Sem renderizador para ${relatorio.formato}`);

    const montado = await this.#documento(relatorio);
    if (!montado.ok) {
      await this.unidade.executar(async (tx) => {
        await this.relatorios.falhar(tx, relatorio.id);
        await this.trilha.registrar(
          tx,
          {
            tipo: 'relatorios.exportacao-falhou',
            entidade: 'relatorio',
            entidadeId: relatorio.id,
            depois: { motivo: montado.erro.message },
          },
          { canal: 'sistema' },
        );
      });
      return 'filtros-invalidos';
    }
    const { documento, linhas } = montado.valor;
    const conteudo = await renderizador.renderizar(documento);
    await this.armazenamento.gravar({
      tenantId: relatorio.tenantId,
      caminho: caminhoDoArquivo(relatorio),
      conteudo,
      tipoMime: renderizador.tipoMime,
    });
    const agora = this.relogio.agora();
    await this.unidade.executar(async (tx) => {
      await this.relatorios.concluir(tx, relatorio.id, {
        em: agora,
        expiraEm: agora.maisMs(VALIDADE_DO_ARQUIVO_MS),
        linhas,
      });
      await this.trilha.registrar(
        tx,
        {
          tipo: 'relatorios.exportacao-gerada',
          entidade: 'relatorio',
          entidadeId: relatorio.id,
          depois: { linhas, bytes: conteudo.byteLength },
        },
        { canal: 'sistema', usuarioId: relatorio.usuarioId },
      );
    });
    return 'gerado';
  }

  async #documento(
    r: Relatorio,
  ): Promise<Result<{ documento: Documento; linhas: number }, Validacao>> {
    const filtros = r.filtros as Record<string, unknown>;
    let corpo: Pick<Documento, 'colunas' | 'rotuloDoGrupo' | 'grupos'>;
    let linhas: number;
    let truncado: boolean;
    if (r.tipo === 'busca-publicacoes') {
      const lidas = await todas((cursor) => this.fonte.publicacoes(comCursor(filtros, cursor)));
      if (!lidas.ok) return lidas;
      linhas = lidas.valor.itens.length;
      truncado = lidas.valor.truncado;
      corpo = linhasDaBuscaDePublicacoes(lidas.valor.itens);
    } else {
      const pedido = r.tipo === 'agenda' ? filtrosDaAgenda(filtros) : filtros;
      const lidos = await todas((cursor) => this.fonte.prazos(comCursor(pedido, cursor)));
      if (!lidos.ok) return lidos;
      linhas = lidos.valor.itens.length;
      truncado = lidos.valor.truncado;
      corpo =
        r.tipo === 'agenda'
          ? linhasDaAgenda(lidos.valor.itens)
          : linhasDaBuscaDePrazos(lidos.valor.itens);
    }
    return ok({
      linhas,
      documento: {
        titulo: TITULOS[r.tipo],
        cabecalho: {
          geradoEm: dataHora(this.relogio.agora()),
          usuario: await this.fonte.nomeDoUsuario(r.usuarioId),
          filtros: descreverFiltros(filtros),
          aviso: truncado
            ? `Limitado às primeiras ${MAXIMO_DE_LINHAS.toLocaleString('pt-BR')} linhas: refine os filtros.`
            : null,
        },
        ...corpo,
      },
    });
  }
}

/** A agenda é a busca de prazos pelo vencimento no período, do mais próximo ao mais distante. */
function filtrosDaAgenda(filtros: Record<string, unknown>): Record<string, unknown> {
  const { de, ate, ...globais } = filtros;
  return { ...globais, periodo: { de, ate, campoData: 'vencimento' }, ordem: 'asc' };
}

const POR_PAGINA = 100;
const comCursor = (filtros: Record<string, unknown>, cursor: string | null) => ({
  ...filtros,
  ...(cursor === null ? {} : { cursor }),
  limite: POR_PAGINA,
});

/** Percorre as páginas da busca até o fim ou até o teto de linhas. */
async function todas<T>(
  pagina: (cursor: string | null) => Promise<Result<Pagina<T>, Validacao>>,
): Promise<Result<{ itens: T[]; truncado: boolean }, Validacao>> {
  const itens: T[] = [];
  let cursor: string | null = null;
  do {
    const r = await pagina(cursor);
    if (!r.ok) return r;
    itens.push(...r.valor.itens);
    cursor = r.valor.proximoCursor;
  } while (cursor !== null && itens.length < MAXIMO_DE_LINHAS);
  const truncado = itens.length > MAXIMO_DE_LINHAS || cursor !== null;
  return ok({ itens: itens.slice(0, MAXIMO_DE_LINHAS), truncado });
}

/** Data e hora de Brasília, como no cabeçalho do relatório. */
function dataHora(instante: Instant): string {
  const texto = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(instante.epochMs);
  return `${texto} (horário de Brasília)`;
}

export interface RelatorioListado {
  readonly id: Uuid;
  readonly tipo: Relatorio['tipo'];
  readonly formato: Formato;
  readonly filtros: Readonly<Record<string, unknown>>;
  readonly situacao: Relatorio['situacao'];
  readonly linhas: number | null;
  readonly solicitadoEm: string;
  readonly concluidoEm: string | null;
  readonly expiraEm: string | null;
  readonly url: string | null;
}

/** Situação e, quando pronto e na validade, o link assinado (só para quem pediu). */
export class ConsultarRelatorios<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly relatorios: RepositorioDeRelatorios<Transacao>,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly relogio: Clock,
  ) {}

  async um(
    solicitante: Pick<Solicitante, 'usuarioId'>,
    id: Uuid,
  ): Promise<Result<RelatorioListado, NaoEncontrado>> {
    const r = await this.unidade.executar((tx) => this.relatorios.buscar(tx, id));
    if (r?.usuarioId !== solicitante.usuarioId) {
      return err(new NaoEncontrado('relatorio-inexistente', 'Relatório não encontrado.'));
    }
    return ok(await this.#listado(r));
  }

  async recentes(solicitante: Pick<Solicitante, 'usuarioId'>): Promise<RelatorioListado[]> {
    const lista = await this.unidade.executar((tx) =>
      this.relatorios.recentes(tx, solicitante.usuarioId, RECENTES),
    );
    return Promise.all(lista.map((r) => this.#listado(r)));
  }

  async #listado(r: Relatorio): Promise<RelatorioListado> {
    const agora = this.relogio.agora();
    const restante = r.expiraEm === undefined ? 0 : agora.msAte(r.expiraEm);
    const url =
      r.situacao === 'concluido' && restante > 1_000
        ? await this.armazenamento.urlAssinada({
            tenantId: r.tenantId,
            caminho: caminhoDoArquivo(r),
            operacao: 'download',
            // O arquivo vale 24 h; cada link, até 15 min (limite do armazenamento) ou o que faltar.
            expiraEmSegundos: Math.min(VALIDADE_DO_LINK_S, Math.floor(restante / 1_000)),
          })
        : null;
    return {
      id: r.id,
      tipo: r.tipo,
      formato: r.formato,
      filtros: r.filtros,
      situacao: r.situacao,
      linhas: r.linhas ?? null,
      solicitadoEm: r.solicitadoEm.paraIso(),
      concluidoEm: r.concluidoEm?.paraIso() ?? null,
      expiraEm: r.expiraEm?.paraIso() ?? null,
      url,
    };
  }
}
