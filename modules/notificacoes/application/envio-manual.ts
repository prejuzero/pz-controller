import { PedidoDeEnvio } from '@pz/contracts';
import { err, gerarUuidV7, NaoEncontrado, ok, RegraDeNegocio, Validacao } from '@pz/kernel';

import type { Notificar } from './notificacoes.js';
import type { RepositorioDeEnvios } from './portas.js';
import type { EnvioRecente } from '../domain/envio.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { ArmazenamentoArquivos } from '@pz/integracoes';
import type { Clock, ErroDominio, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** O que vai anexado: o mesmo formato do evento EnvioManualSolicitado. */
export type AnexoDoEnvio =
  | { readonly origem: 'prazo' | 'publicacao'; readonly id: Uuid; readonly formato: Formato }
  | { readonly origem: 'relatorio'; readonly id: Uuid }
  | {
      readonly origem: 'busca';
      readonly alvo: 'prazos' | 'publicacoes';
      readonly filtros: Readonly<Record<string, unknown>>;
      readonly formato: Formato;
    };
type Formato = 'pdf' | 'xlsx';

/** Porta: quais dos e-mails são de usuários do escritório da transação (identidade, RLS). */
export interface EmailsDoEscritorio<Transacao> {
  internos(transacao: Transacao, emails: readonly string[]): Promise<ReadonlySet<string>>;
}

/** Porta: o recurso existe no tenant (o relatório, só para quem o pediu)? Composta nas apps. */
export type RecursoDoEnvioExiste<Transacao> = (
  transacao: Transacao,
  recurso: 'prazo' | 'publicacao' | 'relatorio',
  id: Uuid,
  usuarioId: Uuid,
) => Promise<boolean>;

export interface RemetenteDoEnvio {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
}

const normalizar = (emails: readonly string[]) => [
  ...new Set(emails.map((e) => e.trim().toLowerCase())),
];

/**
 * Pede o envio manual por e-mail (HU32, RF68–RF70). Destinatário que não é usuário do escritório
 * exige a confirmação explícita do sigilo profissional (CLAUDE.md, seção 14); sem ela, nada sai.
 * Grava a trilha (destinatários e recurso) e o evento na mesma transação; o worker gera o anexo
 * pelo pipeline de relatórios e pede a notificação.
 */
export class SolicitarEnvioManual<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly emails: EmailsDoEscritorio<Transacao>,
    private readonly existe: RecursoDoEnvioExiste<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
    private readonly envios: RepositorioDeEnvios<Transacao>,
  ) {}

  async executar(
    remetente: RemetenteDoEnvio,
    entrada: unknown,
  ): Promise<Result<{ id: Uuid; externos: string[] }, Validacao | NaoEncontrado | RegraDeNegocio>> {
    const lido = PedidoDeEnvio.esquema.safeParse(entrada);
    if (!lido.success)
      return err(
        new Validacao(
          lido.error.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })),
        ),
      );
    const pedido = lido.data;
    const destinatarios = normalizar(pedido.destinatarios);
    const anexo: AnexoDoEnvio =
      pedido.recurso === 'busca'
        ? { origem: 'busca', alvo: pedido.alvo, filtros: pedido.filtros, formato: pedido.formato }
        : pedido.recurso === 'relatorio'
          ? { origem: 'relatorio', id: pedido.recursoId as Uuid }
          : { origem: pedido.recurso, id: pedido.recursoId as Uuid, formato: pedido.formato };

    return this.unidade.executar(async (tx) => {
      const internos = await this.emails.internos(tx, destinatarios);
      const externos = destinatarios.filter((e) => !internos.has(e));
      if (externos.length > 0 && pedido.confirmacaoSigilo !== true) {
        return err(
          new RegraDeNegocio(
            'confirmacao-de-sigilo',
            `Confirme o envio para fora do escritório: ${externos.join(', ')}.`,
          ),
        );
      }
      if (anexo.origem !== 'busca') {
        if (!(await this.existe(tx, anexo.origem, anexo.id, remetente.usuarioId))) {
          return err(new NaoEncontrado(`${anexo.origem}-inexistente`, 'Recurso não encontrado.'));
        }
      }
      const id = gerarUuidV7(this.relogio);
      const mensagem = pedido.mensagem === '' ? undefined : pedido.mensagem;
      await this.trilha.registrar(
        tx,
        {
          tipo: 'notificacoes.envio-manual-solicitado',
          entidade: 'envio',
          entidadeId: id,
          depois: {
            recurso: pedido.recurso,
            anexo,
            destinatarios,
            externos,
            confirmacaoSigilo: externos.length > 0,
          },
        },
        { canal: remetente.canal, usuarioId: remetente.usuarioId },
      );
      await this.envios.registrar(tx, {
        id,
        tenantId: remetente.tenantId,
        usuarioId: remetente.usuarioId,
        recurso: pedido.recurso,
        destinatarios: destinatarios.length,
      });
      await this.outbox.gravar(tx, [
        {
          id: gerarUuidV7(this.relogio),
          tipo: 'EnvioManualSolicitado',
          versao: 1,
          tenantId: remetente.tenantId,
          agregadoId: id,
          ocorridoEm: this.relogio.agora(),
          payload: {
            envioId: id,
            usuarioId: remetente.usuarioId,
            anexo,
            destinatarios,
            ...(mensagem === undefined ? {} : { mensagem }),
          },
        },
      ]);
      return ok({ id, externos });
    });
  }
}

/** Arquivo do anexo, gerado pelo pipeline de relatórios (composto nas apps). */
export type GeradorDoAnexo = (
  usuarioId: Uuid,
  anexo: AnexoDoEnvio,
) => Promise<
  Result<
    { conteudo: Uint8Array; tipoMime: string; extensao: string; numeroProcesso?: string },
    ErroDominio
  >
>;

export interface EnvioManualPedido {
  readonly envioId: Uuid;
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly anexo: AnexoDoEnvio;
  readonly destinatarios: readonly string[];
  readonly mensagem?: string | undefined;
}

export interface DependenciasDoPreparo<Transacao> {
  readonly unidade: UnidadeDeTrabalho<Transacao>;
  readonly arquivos: Pick<ArmazenamentoArquivos, 'gravar'>;
  readonly gerar: GeradorDoAnexo;
  readonly notificar: Notificar<Transacao>;
  readonly trilha: TrilhaDeAuditoria<Transacao>;
  readonly envios: RepositorioDeEnvios<Transacao>;
  /** Nome de quem envia, para o e-mail. */
  readonly nomeDoRemetente: (transacao: Transacao, usuarioId: Uuid) => Promise<string | undefined>;
  /** Caminho estável do recurso no portal (abrível pelo app). */
  readonly link: (anexo: AnexoDoEnvio) => string;
  readonly relogio: Clock;
}

export type ResultadoDoPreparo = 'solicitado' | 'ja-solicitado' | 'falhou';

const NOMES: Readonly<Record<AnexoDoEnvio['origem'], string>> = {
  prazo: 'prazo',
  publicacao: 'publicacao',
  busca: 'busca',
  relatorio: 'relatorio',
};

/**
 * Prepara o envio manual (worker, HU32): gera o anexo, grava no armazenamento do tenant e pede a
 * notificação de e-mail com os destinatários escolhidos (o envio é do módulo, não direto).
 * Idempotente: o caminho do arquivo e a chave da notificação derivam do id do envio. Recurso que
 * sumiu ou destinatários todos suprimidos ficam na trilha como falha (não adianta repetir).
 */
export class PrepararEnvioManual<Transacao> {
  constructor(private readonly d: DependenciasDoPreparo<Transacao>) {}

  async executar(pedido: EnvioManualPedido): Promise<ResultadoDoPreparo> {
    const gerado = await this.d.gerar(pedido.usuarioId, pedido.anexo);
    if (!gerado.ok) return this.#falhou(pedido, gerado.erro.codigo);
    const nome = `prejuzero-${NOMES[pedido.anexo.origem]}.${gerado.valor.extensao}`;
    const caminho = `envios/${pedido.envioId}/${nome}`;
    await this.d.arquivos.gravar({
      tenantId: pedido.tenantId,
      caminho,
      conteudo: gerado.valor.conteudo,
      tipoMime: gerado.valor.tipoMime,
    });
    const resultado = await this.d.unidade.executar(async (tx) => {
      const remetente = (await this.d.nomeDoRemetente(tx, pedido.usuarioId)) ?? 'Um advogado';
      const pedida = await this.d.notificar.executar(tx, {
        tipo: 'envio-manual',
        tenantId: pedido.tenantId,
        usuarioId: pedido.usuarioId,
        janela: pedido.envioId,
        destinatarios: [...pedido.destinatarios],
        anexo: { caminho, nome, tipoMime: gerado.valor.tipoMime },
        dados: {
          recurso: pedido.anexo.origem,
          ...(gerado.valor.numeroProcesso === undefined
            ? {}
            : { numeroProcesso: gerado.valor.numeroProcesso }),
          remetente,
          ...(pedido.mensagem === undefined ? {} : { observacao: pedido.mensagem }),
          link: this.d.link(pedido.anexo),
        },
      });
      // A situação no portal acompanha a notificação (enviada, rejeitada).
      if (pedida.ok && pedida.valor.solicitada)
        await this.d.envios.vincularNotificacao(tx, pedido.envioId, pedida.valor.notificacaoId);
      return pedida;
    });
    // Dados recusados pelo template são defeito de quem monta o pedido: retentativa e DLQ.
    if (!resultado.ok) throw resultado.erro;
    if (resultado.valor.solicitada) return 'solicitado';
    if (resultado.valor.motivo === 'ja-solicitada') return 'ja-solicitado';
    return this.#falhou(pedido, 'destinatarios-suprimidos');
  }

  async #falhou(pedido: EnvioManualPedido, motivo: string): Promise<'falhou'> {
    await this.d.unidade.executar(async (tx) => {
      await this.d.trilha.registrar(
        tx,
        {
          tipo: 'notificacoes.envio-manual-falhou',
          entidade: 'envio',
          entidadeId: pedido.envioId,
          depois: { motivo },
        },
        { canal: 'sistema', usuarioId: pedido.usuarioId },
      );
      // Quem enviou vê a falha no portal (PZ-361): nada falha em silêncio.
      await this.d.envios.marcarFalha(tx, pedido.envioId, motivo, this.d.relogio.agora());
    });
    return 'falhou';
  }
}

/** Quantos envios recentes o portal mostra a quem enviou (PZ-361). */
export const LIMITE_DE_ENVIOS_RECENTES = 20;

/** Envios recentes de quem está na sessão, com a situação de cada um (PZ-361). */
export class ListarEnviosRecentes<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly envios: RepositorioDeEnvios<Transacao>,
  ) {}

  executar(usuarioId: Uuid): Promise<EnvioRecente[]> {
    return this.unidade.executar((tx) =>
      this.envios.recentes(tx, usuarioId, LIMITE_DE_ENVIOS_RECENTES),
    );
  }
}

/**
 * Retenção do anexo do envio manual (PZ-362): 7 dias depois do pedido. Cobre as retentativas da
 * fila e o tempo de quem enviou ver a situação; o e-mail já levou o arquivo. A carência do
 * encerramento de conta (30 dias) é maior, então nada sobra de conta encerrada.
 */
export const RETENCAO_DOS_ANEXOS_MS = 7 * 24 * 3600 * 1000;
const LOTE_DOS_ANEXOS = 200;

/**
 * Apaga do armazenamento os anexos de envios mais antigos que a retenção (PZ-362, minimização,
 * LGPD). Roda como sistema (job diário, atravessa escritórios); a linha do envio fica, com
 * `anexoRemovidoEm`. Sem notificação (falhou antes de pedir o e-mail), o nome sai do recurso, nas
 * duas extensões possíveis; remover o que não existe não é erro.
 */
export class RemoverAnexosAntigos<Transacao> {
  constructor(
    private readonly sistema: UnidadeDeTrabalho<Transacao>,
    private readonly envios: RepositorioDeEnvios<Transacao>,
    private readonly armazenamento: Pick<ArmazenamentoArquivos, 'remover'>,
    private readonly relogio: Pick<Clock, 'agora'>,
    private readonly lote = LOTE_DOS_ANEXOS,
  ) {}

  async executar(): Promise<{ removidos: number }> {
    const agora = this.relogio.agora();
    const ate = agora.maisMs(-RETENCAO_DOS_ANEXOS_MS);
    let removidos = 0;
    for (;;) {
      const antigos = await this.sistema.executar((tx) =>
        this.envios.comAnexoAte(tx, ate, this.lote),
      );
      for (const e of antigos) {
        const caminhos =
          e.caminhoDoAnexo === null
            ? ['pdf', 'xlsx'].map((ext) => `envios/${e.id}/prejuzero-${NOMES[e.recurso]}.${ext}`)
            : [e.caminhoDoAnexo];
        for (const caminho of caminhos) await this.armazenamento.remover(e.tenantId, caminho);
        await this.sistema.executar((tx) => this.envios.marcarAnexoRemovido(tx, e.id, agora));
        removidos++;
      }
      if (antigos.length < this.lote) return { removidos };
    }
  }
}
