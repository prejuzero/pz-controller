import { err, gerarUuidV7, NaoEncontrado, ok, Proibido, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { ESCOPOS_DE_EXPORTACAO, paraCsv, paraJson } from '../domain/exportacao.js';

import type { Exportacao, FonteDeExportacao, RepositorioDeExportacoes } from './portas.js';
import type { EscopoDeExportacao } from '../domain/exportacao.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { ArmazenamentoArquivos } from '@pz/integracoes';
import type { Clock, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Arquivos ficam disponíveis por 7 dias; o link assinado vale 15 minutos. */
const VALIDADE_DOS_ARQUIVOS_MS = 7 * 24 * 3_600_000;
const VALIDADE_DO_LINK_S = 15 * 60;
const ARQUIVOS = [
  { nome: 'dados.json', tipoMime: 'application/json' },
  { nome: 'dados.csv', tipoMime: 'text/csv' },
] as const;

const caminhoDe = (id: Uuid, arquivo: string) => `privacidade/exportacoes/${id}/${arquivo}`;

export interface SolicitanteDaExportacao {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
  /** Permissão `escritorio:exportar` (dono do escritório), conferida na API. */
  readonly podeExportarEscritorio: boolean;
}

export const EntradaDaExportacao = z.object({ escopo: z.enum(ESCOPOS_DE_EXPORTACAO) }).strict();

export interface ExportacaoListada {
  readonly id: Uuid;
  readonly escopo: EscopoDeExportacao;
  readonly situacao: Exportacao['situacao'];
  readonly solicitadaEm: string;
  readonly concluidaEm: string | null;
  readonly expiraEm: string | null;
  /** Links assinados (15 min) quando concluída e dentro da validade. */
  readonly arquivos: readonly { readonly nome: string; readonly url: string }[];
}

/**
 * Pedido de exportação (HU38, LGPD art. 18): grava o pedido, a trilha e o evento que o worker
 * processa, na mesma transação. Pedido pendente do mesmo escopo é devolvido, não repetido.
 */
export class SolicitarExportacao<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly exportacoes: RepositorioDeExportacoes<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    solicitante: SolicitanteDaExportacao,
    entrada: unknown,
  ): Promise<Result<{ id: Uuid; nova: boolean }, Validacao | Proibido>> {
    const dados = EntradaDaExportacao.safeParse(entrada);
    if (!dados.success) {
      return err(
        new Validacao(
          dados.error.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })),
        ),
      );
    }
    const { escopo } = dados.data;
    if (escopo === 'escritorio' && !solicitante.podeExportarEscritorio) {
      return err(
        new Proibido(
          'exportacao-do-escritorio',
          'Só o responsável pelo escritório exporta os dados dele.',
        ),
      );
    }
    return this.unidade.executar(async (tx) => {
      const existente = await this.exportacoes.pendente(tx, solicitante.usuarioId, escopo);
      if (existente !== undefined) return ok({ id: existente.id, nova: false });
      const agora = this.relogio.agora();
      const id = gerarUuidV7(this.relogio);
      await this.exportacoes.inserir(tx, {
        id,
        tenantId: solicitante.tenantId,
        usuarioId: solicitante.usuarioId,
        escopo,
        situacao: 'pendente',
        solicitadaEm: agora,
      });
      await this.trilha.registrar(
        tx,
        {
          tipo: 'privacidade.exportacao-solicitada',
          entidade: 'exportacao_dados',
          entidadeId: id,
          depois: { escopo },
        },
        { canal: solicitante.canal, usuarioId: solicitante.usuarioId },
      );
      await this.outbox.gravar(tx, [
        {
          id: gerarUuidV7(this.relogio),
          tipo: 'ExportacaoDeDadosSolicitada',
          versao: 1,
          tenantId: solicitante.tenantId,
          agregadoId: id,
          ocorridoEm: agora,
          payload: { exportacaoId: id, usuarioId: solicitante.usuarioId, escopo },
        },
      ]);
      return ok({ id, nova: true });
    });
  }
}

const EventoSolicitado = z.object({
  tenantId: z.uuid(),
  payload: z.object({
    exportacaoId: z.uuid(),
    usuarioId: z.uuid(),
    escopo: z.enum(ESCOPOS_DE_EXPORTACAO),
  }),
});

/**
 * Gera os arquivos (worker, consumidor do evento, na transação do tenant): junta as seções de
 * todas as fontes, grava JSON e CSV no armazenamento e marca concluída. Repetir regrava os
 * mesmos caminhos; concluída não é gerada de novo. Falha lança (retentativa e DLQ).
 */
export class GerarExportacao<Transacao> {
  constructor(
    private readonly exportacoes: RepositorioDeExportacoes<Transacao>,
    private readonly fontes: readonly FonteDeExportacao<Transacao>[],
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly relogio: Clock,
  ) {}

  async executar(transacao: Transacao, evento: unknown): Promise<void> {
    const { tenantId, payload } = EventoSolicitado.parse(evento);
    const id = payload.exportacaoId as Uuid;
    const exportacao = await this.exportacoes.buscar(transacao, id);
    if (exportacao === undefined) throw new Error(`Exportação ${id} não encontrada no tenant`);
    if (exportacao.situacao === 'concluida') return;
    const secoes = [];
    for (const fonte of this.fontes) {
      secoes.push(
        ...(payload.escopo === 'titular'
          ? await fonte.titular(transacao, payload.usuarioId as Uuid)
          : await fonte.escritorio(transacao)),
      );
    }
    const agora = this.relogio.agora();
    const conteudos = {
      'dados.json': paraJson(secoes, { escopo: payload.escopo, geradoEm: agora.paraIso() }),
      'dados.csv': paraCsv(secoes),
    };
    for (const { nome, tipoMime } of ARQUIVOS) {
      await this.armazenamento.gravar({
        tenantId: tenantId as Uuid,
        caminho: caminhoDe(id, nome),
        conteudo: new TextEncoder().encode(conteudos[nome]),
        tipoMime,
      });
    }
    await this.exportacoes.concluir(transacao, id, agora, agora.maisMs(VALIDADE_DOS_ARQUIVOS_MS));
  }
}

/** Situação do pedido e, quando pronto, os links assinados (só o próprio solicitante). */
export class ConsultarExportacao<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly exportacoes: RepositorioDeExportacoes<Transacao>,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly relogio: Clock,
  ) {}

  async executar(
    solicitante: Pick<SolicitanteDaExportacao, 'tenantId' | 'usuarioId'>,
    id: Uuid,
  ): Promise<Result<ExportacaoListada, NaoEncontrado>> {
    const exportacao = await this.unidade.executar((tx) => this.exportacoes.buscar(tx, id));
    if (exportacao?.usuarioId !== solicitante.usuarioId) {
      return err(new NaoEncontrado('exportacao-inexistente', 'Exportação não encontrada.'));
    }
    const disponivel =
      exportacao.situacao === 'concluida' &&
      exportacao.expiraEm !== undefined &&
      this.relogio.agora().ehAntesDe(exportacao.expiraEm);
    const arquivos = disponivel
      ? await Promise.all(
          ARQUIVOS.map(async ({ nome }) => ({
            nome,
            url: await this.armazenamento.urlAssinada({
              tenantId: solicitante.tenantId,
              caminho: caminhoDe(id, nome),
              operacao: 'download',
              expiraEmSegundos: VALIDADE_DO_LINK_S,
            }),
          })),
        )
      : [];
    return ok({
      id: exportacao.id,
      escopo: exportacao.escopo,
      situacao: exportacao.situacao,
      solicitadaEm: exportacao.solicitadaEm.paraIso(),
      concluidaEm: exportacao.concluidaEm?.paraIso() ?? null,
      expiraEm: exportacao.expiraEm?.paraIso() ?? null,
      arquivos,
    });
  }
}
