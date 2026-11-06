import { PedidoDeRelatorio } from '@pz/contracts';
import { err, gerarUuidV7, LocalDate, NaoEncontrado, ok, Proibido, Validacao } from '@pz/kernel';

import {
  descreverFiltros,
  linhasDaAgenda,
  linhasDaBuscaDePrazos,
  linhasDaBuscaDePublicacoes,
  linhasDoControleDeCiencia,
  linhasDoHistorico,
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
  /** Administrador do escritório: exporta o histórico de qualquer prazo (HU41, RF88). */
  readonly veTodosOsHistoricos?: boolean;
}

/**
 * Porta: o solicitante pode ver o histórico do prazo (regra do módulo auditoria, aplicada na
 * composição). Prazo inexistente responde `true`: a geração avisa que não encontrou.
 */
export type HistoricoVisivel = (
  prazoId: string,
  leitor: { readonly usuarioId: string; readonly veTodos: boolean },
) => Promise<boolean>;

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
    private readonly historicoVisivel: HistoricoVisivel = () => Promise.resolve(true),
  ) {}

  async executar(
    solicitante: Solicitante,
    entrada: unknown,
  ): Promise<Result<{ id: Uuid }, Validacao | Proibido>> {
    const lido = PedidoDeRelatorio.esquema.safeParse(entrada);
    if (!lido.success) return err(validacao(lido.error));
    const pedido = lido.data;
    if (pedido.tipo === 'historico-prazo') {
      const visivel = await this.historicoVisivel(pedido.filtros.prazoId, {
        usuarioId: solicitante.usuarioId,
        veTodos: solicitante.veTodosOsHistoricos === true,
      });
      if (!visivel) {
        return err(
          new Proibido('historico-de-outro', 'O histórico deste prazo é do responsável por ele.'),
        );
      }
    }
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

  /**
   * O job esgotou as tentativas e foi para a DLQ (PZ-353): o pedido deixa de ficar "pendente" na
   * tela e vira "falhou", com trilha. Só uma vez: se já tinha concluído ou falhado, nada muda.
   */
  async tentativasEsgotadas(relatorioId: Uuid, motivo: string): Promise<boolean> {
    return this.unidade.executar(async (tx) => {
      if (!(await this.relatorios.falhar(tx, relatorioId))) return false;
      await this.trilha.registrar(
        tx,
        {
          tipo: 'relatorios.exportacao-falhou',
          entidade: 'relatorio',
          entidadeId: relatorioId,
          depois: { motivo: 'tentativas-esgotadas', erro: motivo.slice(0, 200) },
        },
        { canal: 'sistema' },
      );
      return true;
    });
  }

  #documento(r: Relatorio) {
    return montarDocumento(this.fonte, this.relogio, r.tipo, r.filtros, r.usuarioId);
  }
}

type Corpo = Pick<Documento, 'colunas' | 'rotuloDoGrupo' | 'grupos'>;

/** Monta o documento de um relatório pelos filtros, com a busca da HU28 (mesma ordem da tela). */
async function montarDocumento(
  fonte: FonteDosRelatorios,
  relogio: Clock,
  tipo: Relatorio['tipo'],
  filtros: Readonly<Record<string, unknown>>,
  usuarioId: Uuid,
): Promise<Result<{ documento: Documento; linhas: number }, Validacao>> {
  let corpo: Corpo;
  let linhas: number;
  let truncado: boolean;
  const f = filtros as Record<string, unknown>;
  if (tipo === 'historico-prazo') return historicoVerificavel(fonte, relogio, f, usuarioId);
  if (tipo === 'busca-publicacoes') {
    const lidas = await todas((cursor) => fonte.publicacoes(comCursor(f, cursor)));
    if (!lidas.ok) return lidas;
    linhas = lidas.valor.itens.length;
    truncado = lidas.valor.truncado;
    corpo = linhasDaBuscaDePublicacoes(lidas.valor.itens);
  } else {
    const pedido = tipo === 'agenda' ? filtrosDaAgenda(f) : f;
    const lidos = await todas((cursor) => fonte.prazos(comCursor(pedido, cursor)));
    if (!lidos.ok) return lidos;
    linhas = lidos.valor.itens.length;
    truncado = lidos.valor.truncado;
    if (tipo === 'controle-ciencia') {
      const ciencias = await fonte.controleDeCiencia(lidos.valor.itens.map((p) => p.id));
      corpo = linhasDoControleDeCiencia(
        lidos.valor.itens,
        new Map(
          [...ciencias].map(([id, c]) => [
            id,
            {
              confirmadaEm: c.confirmadaEm === undefined ? null : dataHora(c.confirmadaEm),
              canal: c.canal ?? null,
              enviadas: c.enviadas,
              entregues: c.entregues,
              rejeitadas: c.rejeitadas,
            },
          ]),
        ),
      );
    } else {
      corpo =
        tipo === 'agenda'
          ? linhasDaAgenda(lidos.valor.itens)
          : linhasDaBuscaDePrazos(lidos.valor.itens);
    }
  }
  return ok({
    linhas,
    documento: await comCabecalho(
      fonte,
      relogio,
      TITULOS[tipo],
      filtros,
      usuarioId,
      corpo,
      truncado,
    ),
  });
}

/** Histórico verificável (HU35): eventos, hashes e o código impresso com o QR code. */
async function historicoVerificavel(
  fonte: FonteDosRelatorios,
  relogio: Clock,
  filtros: Record<string, unknown>,
  usuarioId: Uuid,
): Promise<Result<{ documento: Documento; linhas: number }, Validacao>> {
  const prazoId = typeof filtros.prazoId === 'string' ? filtros.prazoId : '';
  const historico = await fonte.historicoDoPrazo(prazoId);
  if (historico === undefined) return err(invalido('filtros.prazoId', 'Prazo não encontrado.'));
  const corpo = linhasDoHistorico(
    historico.eventos.map((e) => ({ ...e, quando: dataHora(e.criadoEm) })),
  );
  const documento = await comCabecalho(
    fonte,
    relogio,
    TITULOS['historico-prazo'],
    {},
    usuarioId,
    corpo,
  );
  return ok({
    linhas: historico.eventos.length,
    documento: {
      ...documento,
      cabecalho: {
        ...documento.cabecalho,
        filtros: [
          ['Código de verificação', historico.codigo],
          ['Verifique em', historico.url],
        ],
      },
      verificacao: { codigo: historico.codigo, url: historico.url },
    },
  });
}

/**
 * O filtro impresso mostra quem é, não o id (PZ-352): cliente pelo cadastro e advogado
 * responsável pela identidade. Id que não existe no escritório sai como "(não encontrado)".
 */
async function comNomes(
  fonte: FonteDosRelatorios,
  filtros: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const { clienteId, responsavelId } = filtros;
  const naoEncontrado = '(não encontrado)';
  return {
    ...filtros,
    ...(typeof clienteId === 'string'
      ? { clienteId: (await fonte.nomeDoCliente(clienteId as Uuid)) ?? naoEncontrado }
      : {}),
    ...(typeof responsavelId === 'string'
      ? { responsavelId: (await fonte.nomeDoUsuario(responsavelId as Uuid)) || naoEncontrado }
      : {}),
  };
}

async function comCabecalho(
  fonte: FonteDosRelatorios,
  relogio: Clock,
  titulo: string,
  filtros: Readonly<Record<string, unknown>>,
  usuarioId: Uuid,
  corpo: Corpo,
  truncado = false,
): Promise<Documento> {
  return {
    titulo,
    cabecalho: {
      geradoEm: dataHora(relogio.agora()),
      usuario: await fonte.nomeDoUsuario(usuarioId),
      filtros: descreverFiltros(await comNomes(fonte, filtros)),
      aviso: truncado
        ? `Limitado às primeiras ${MAXIMO_DE_LINHAS.toLocaleString('pt-BR')} linhas: refine os filtros.`
        : null,
    },
    ...corpo,
  };
}

/** O que o envio manual (HU32) anexa: um prazo, uma publicação, uma busca ou um relatório pedido. */
export type PedidoDeArquivo =
  | { readonly origem: 'prazo'; readonly id: Uuid; readonly formato: Formato }
  | { readonly origem: 'publicacao'; readonly id: Uuid; readonly formato: Formato }
  | {
      readonly origem: 'busca';
      readonly alvo: 'prazos' | 'publicacoes';
      readonly filtros: Readonly<Record<string, unknown>>;
      readonly formato: Formato;
    }
  | { readonly origem: 'relatorio'; readonly id: Uuid };

export interface ArquivoGerado {
  readonly conteudo: Uint8Array;
  readonly tipoMime: string;
  readonly extensao: string;
  /** Do prazo ou da publicação, para o assunto do e-mail. */
  readonly numeroProcesso?: string;
}

const relatorioInexistente = () =>
  new NaoEncontrado('relatorio-inexistente', 'Relatório não encontrado.');

/**
 * Gera o arquivo do envio manual (HU32) pelo mesmo pipeline dos relatórios (documento e
 * renderizadores), sem gravar pedido de relatório. Relatório já pedido é gerado de novo com os
 * mesmos tipo, formato e filtros, só para quem o pediu. Roda no tenant do chamador (RLS).
 */
export class GerarArquivo<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly relatorios: RepositorioDeRelatorios<Transacao>,
    private readonly fonte: FonteDosRelatorios,
    private readonly renderizadores: readonly Renderizador[],
    private readonly relogio: Clock,
  ) {}

  async executar(
    usuarioId: Uuid,
    pedido: PedidoDeArquivo,
  ): Promise<Result<ArquivoGerado, Validacao | NaoEncontrado>> {
    let formato: Formato;
    let documento: Documento;
    let numeroProcesso: string | undefined;
    if (pedido.origem === 'relatorio') {
      const r = await this.unidade.executar((tx) => this.relatorios.buscar(tx, pedido.id));
      if (r?.usuarioId !== usuarioId) return err(relatorioInexistente());
      const montado = await montarDocumento(this.fonte, this.relogio, r.tipo, r.filtros, usuarioId);
      if (!montado.ok) return montado;
      formato = r.formato;
      documento = montado.valor.documento;
    } else if (pedido.origem === 'busca') {
      const tipo = pedido.alvo === 'prazos' ? 'busca-prazos' : 'busca-publicacoes';
      const montado = await montarDocumento(
        this.fonte,
        this.relogio,
        tipo,
        pedido.filtros,
        usuarioId,
      );
      if (!montado.ok) return montado;
      formato = pedido.formato;
      documento = montado.valor.documento;
    } else if (pedido.origem === 'prazo') {
      const lido = await this.fonte.prazo(pedido.id);
      if (lido === undefined)
        return err(new NaoEncontrado('prazo-inexistente', 'Prazo não encontrado.'));
      formato = pedido.formato;
      numeroProcesso = lido.numeroProcesso;
      documento = await comCabecalho(
        this.fonte,
        this.relogio,
        TITULOS.prazo,
        numeroProcesso === undefined ? {} : { numeroCnj: numeroProcesso },
        usuarioId,
        linhasDaAgenda([lido.prazo]),
      );
    } else {
      const lida = await this.fonte.publicacao(pedido.id);
      if (lida === undefined)
        return err(new NaoEncontrado('publicacao-inexistente', 'Publicação não encontrada.'));
      formato = pedido.formato;
      numeroProcesso = lida.numeroCnj ?? undefined;
      documento = await comCabecalho(
        this.fonte,
        this.relogio,
        TITULOS.publicacao,
        {},
        usuarioId,
        linhasDaBuscaDePublicacoes([lida], true),
      );
    }
    const renderizador = this.renderizadores.find((r) => r.formato === formato);
    if (renderizador === undefined) throw new Error(`Sem renderizador para ${formato}`);
    return ok({
      conteudo: await renderizador.renderizar(documento),
      tipoMime: renderizador.tipoMime,
      extensao: EXTENSOES[formato],
      ...(numeroProcesso === undefined ? {} : { numeroProcesso }),
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

/** Quantos relatórios a limpeza trata por consulta (PZ-353). */
export const LOTE_DA_LIMPEZA = 200;

/**
 * Apaga do armazenamento os arquivos de relatórios cujo link já expirou (PZ-353, HU29): o
 * download deixa de existir às 24 h e o arquivo não deve ficar guardado sem uso (minimização,
 * LGPD). Roda como sistema (job diário, atravessa escritórios); a linha do relatório fica, com
 * `arquivoRemovidoEm`. Remover de novo um arquivo que já sumiu não é erro.
 */
export class RemoverArquivosExpirados<Transacao> {
  constructor(
    private readonly sistema: UnidadeDeTrabalho<Transacao>,
    private readonly relatorios: RepositorioDeRelatorios<Transacao>,
    private readonly armazenamento: Pick<ArmazenamentoArquivos, 'remover'>,
    private readonly relogio: Clock,
    private readonly lote = LOTE_DA_LIMPEZA,
  ) {}

  async executar(): Promise<{ removidos: number }> {
    const agora = this.relogio.agora();
    let removidos = 0;
    for (;;) {
      const expirados = await this.sistema.executar((tx) =>
        this.relatorios.expiradosComArquivo(tx, agora, this.lote),
      );
      for (const r of expirados) {
        await this.armazenamento.remover(r.tenantId, caminhoDoArquivo(r));
        await this.sistema.executar((tx) => this.relatorios.marcarArquivoRemovido(tx, r.id, agora));
        removidos++;
      }
      if (expirados.length < this.lote) return { removidos };
    }
  }
}
