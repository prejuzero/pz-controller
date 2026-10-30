import { ErroIntegracao } from '@pz/integracoes';
import { err, gerarUuidV7, ok, Validacao } from '@pz/kernel';

import { decidir } from '../domain/decisao.js';
import { classificarPorRegras } from '../domain/regras.js';

import { regrasValidas } from './classificar.js';

import type { RepositorioDeRegras } from './classificar.js';
import type { Classificacao, RespostaDaIa } from '../domain/decisao.js';
import type { ArmazenamentoArquivos, ExtratorDeTexto, TextoExtraido } from '@pz/integracoes';
import type { Clock, EventoDominio, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Porta: teor do conteúdo visível na transação (módulo publicacoes). */
export interface LeitorDeTeor<Transacao> {
  teor(transacao: Transacao, conteudoId: Uuid): Promise<string | undefined>;
}

export interface TipoDaTaxonomia {
  readonly codigo: string;
  readonly nome: string;
  readonly descricao: string;
}

/** Porta: taxonomia única de atos (módulo prazos, HU15). */
export interface Taxonomia<Transacao> {
  listar(transacao: Transacao): Promise<TipoDaTaxonomia[]>;
}

/**
 * Porta: classificação por IA (plataforma de IA, tarefa `classificar-ato`). Saída fora do schema
 * vira `{ tipo: 'invalida' }`; falha passageira do provedor lança (o job tenta de novo).
 */
export interface ClassificadorIa {
  classificar(
    entrada: { readonly teor: string; readonly taxonomia: readonly TipoDaTaxonomia[] },
    tenantId: Uuid,
  ): Promise<RespostaDaIa>;
}

/** Porta: classificações gravadas, uma por conteúdo. */
export interface RepositorioDeClassificacoes<Transacao> {
  existe(transacao: Transacao, conteudoId: Uuid): Promise<boolean>;
  /** Falso se outro processo gravou antes (a primeira vale). */
  gravar(transacao: Transacao, conteudoId: Uuid, classificacao: Classificacao): Promise<boolean>;
}

export interface DependenciasDaClassificacao<Transacao> {
  readonly teores: LeitorDeTeor<Transacao>;
  readonly regras: RepositorioDeRegras<Transacao>;
  readonly taxonomia: Taxonomia<Transacao>;
  /** Ausente: IA desligada (sem chave configurada). */
  readonly ia?: ClassificadorIa;
  readonly classificacoes: RepositorioDeClassificacoes<Transacao>;
  readonly outbox: Outbox<Transacao>;
  readonly relogio: Clock;
}

/**
 * Consumidor de PublicacaoNova (HU21): regras rápidas primeiro; a IA só quando elas não
 * decidem. Saída inválida tem uma nova tentativa; repetida, vai para revisão manual. Grava uma
 * classificação por conteúdo e publica PublicacaoClassificada uma vez, na mesma transação.
 */
export class ClassificarPublicacao<Transacao> {
  constructor(private readonly deps: DependenciasDaClassificacao<Transacao>) {}

  async executar(
    transacao: Transacao,
    evento: { readonly tenantId: Uuid; readonly payload: { readonly conteudoId: string } },
  ): Promise<Classificacao | undefined> {
    const conteudoId = evento.payload.conteudoId as Uuid;
    const { deps } = this;
    if (await deps.classificacoes.existe(transacao, conteudoId)) return undefined;
    const teor = await deps.teores.teor(transacao, conteudoId);
    // Nada falha em silêncio: conteúdo sumido é defeito (o evento vai para a DLQ com o motivo).
    if (teor === undefined)
      throw new Error(`Conteúdo ${conteudoId} não encontrado para classificar`);
    const regras = classificarPorRegras(teor, regrasValidas(await deps.regras.vigentes(transacao)));
    const tipos = await deps.taxonomia.listar(transacao);
    const entrada = { teor, taxonomia: tipos.map((t) => t.codigo), regras };
    const classificacao =
      decidir(entrada) ??
      decidir({ ...entrada, ia: await consultarIa(deps.ia, teor, tipos, evento.tenantId) });
    if (await deps.classificacoes.gravar(transacao, conteudoId, classificacao)) {
      await deps.outbox.gravar(transacao, [
        this.#evento(evento.tenantId, conteudoId, classificacao),
      ]);
    }
    return classificacao;
  }

  #evento(tenantId: Uuid, conteudoId: Uuid, c: Classificacao): EventoDominio {
    return {
      id: gerarUuidV7(this.deps.relogio),
      tipo: 'PublicacaoClassificada',
      versao: 1,
      tenantId,
      agregadoId: conteudoId,
      ocorridoEm: this.deps.relogio.agora(),
      payload: {
        conteudoId,
        origem: c.origem,
        situacao: c.situacao,
        tipoAto: c.tipoAto,
        confianca: c.confianca,
        prazoCitado:
          c.prazoCitado === null
            ? null
            : {
                quantidade: c.prazoCitado.quantidade,
                unidade: c.prazoCitado.unidade,
                unidadeImplicita: c.prazoCitado.unidadeImplicita,
                divergente: c.prazoCitado.divergente,
              },
      },
    };
  }
}

/** IA com uma nova tentativa se a saída vier fora do schema (HU21). Sem IA: "desligada". */
async function consultarIa(
  ia: ClassificadorIa | undefined,
  teor: string,
  taxonomia: readonly TipoDaTaxonomia[],
  tenantId: Uuid,
): Promise<RespostaDaIa> {
  if (ia === undefined) return { tipo: 'desligada' };
  const primeira = await ia.classificar({ teor, taxonomia }, tenantId);
  return primeira.tipo === 'invalida' ? ia.classificar({ teor, taxonomia }, tenantId) : primeira;
}

/** Maior texto colado aceito: uma intimação, não um processo inteiro. */
export const MAXIMO_DO_TEXTO = 50_000;

/**
 * Cadastro assistido (HU25, PZ-173): o texto colado pelo advogado passa pelo mesmo pipeline da
 * publicação (regras rápidas, depois a IA), sem gravar nada. Devolve ato, prazo citado e
 * evidência; nunca uma data (ADR-008). A data vem do motor quando o advogado calcula.
 */
export class AnalisarTexto<Transacao> {
  constructor(
    private readonly deps: Pick<
      DependenciasDaClassificacao<Transacao>,
      'regras' | 'taxonomia' | 'ia'
    > & {
      readonly unidade: UnidadeDeTrabalho<Transacao>;
    },
  ) {}

  async executar(texto: string, tenantId: Uuid): Promise<Classificacao> {
    const teor = texto.trim().slice(0, MAXIMO_DO_TEXTO);
    const { deps } = this;
    const [vigentes, tipos] = await deps.unidade.executar(async (tx) => [
      await deps.regras.vigentes(tx),
      await deps.taxonomia.listar(tx),
    ]);
    const entrada = {
      teor,
      taxonomia: tipos.map((t) => t.codigo),
      regras: classificarPorRegras(teor, regrasValidas(vigentes)),
    };
    // Com a resposta da IA (ou o motivo de não haver), `decidir` sempre conclui.
    return (
      decidir(entrada) ??
      decidir({ ...entrada, ia: await consultarIa(deps.ia, teor, tipos, tenantId) })
    );
  }
}

/** Maior PDF aceito no cadastro assistido (card PZ-173). */
export const MAXIMO_DO_PDF_BYTES = 10 * 1024 * 1024;

/** O PDF enviado, já guardado no armazenamento do tenant, e a análise do texto dele. */
export interface DocumentoAnalisado {
  readonly arquivoId: string;
  readonly paginas: number;
  readonly analise: Classificacao;
}

/**
 * Cadastro assistido por PDF (HU25, PZ-173): extrai o texto (porta ExtratorDeTexto, ADR-019),
 * guarda o PDF no armazenamento do tenant (vinculado ao prazo quando ele for criado) e analisa
 * o texto pelo mesmo pipeline. PDF escaneado, sem texto, é recusado com a orientação de
 * cadastrar à mão. Nada é gravado no banco.
 */
export class AnalisarDocumento<Transacao> {
  constructor(
    private readonly analisar: AnalisarTexto<Transacao>,
    private readonly extrator: ExtratorDeTexto,
    private readonly armazenamento: Pick<ArmazenamentoArquivos, 'gravar'>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    tenantId: Uuid,
    conteudo: Uint8Array,
  ): Promise<Result<DocumentoAnalisado, Validacao>> {
    if (conteudo.byteLength > MAXIMO_DO_PDF_BYTES) {
      return err(
        new Validacao(
          [{ campo: 'arquivo', mensagem: 'O PDF passa de 10 MB.' }],
          'pdf-grande',
          'O PDF passa de 10 MB.',
        ),
      );
    }
    let extraido: TextoExtraido;
    try {
      extraido = await this.extrator.extrairDePdf(conteudo);
    } catch (erro) {
      // Erro permanente (não é PDF, corrompido, protegido): resposta clara ao advogado.
      if (erro instanceof ErroIntegracao && !erro.retentavel) {
        return err(
          new Validacao(
            [{ campo: 'arquivo', mensagem: 'Não foi possível ler este PDF.' }],
            'pdf-invalido',
            'Não foi possível ler este PDF.',
          ),
        );
      }
      throw erro;
    }
    if (extraido.texto === '') {
      return err(
        new Validacao(
          [
            {
              campo: 'arquivo',
              mensagem: 'O PDF não tem texto (parece escaneado). Cadastre o prazo à mão.',
            },
          ],
          'pdf-sem-texto',
          'O PDF não tem texto (parece escaneado). Cadastre o prazo à mão.',
        ),
      );
    }
    const arquivoId = `assistente/${gerarUuidV7(this.relogio)}.pdf`;
    await this.armazenamento.gravar({
      tenantId,
      caminho: arquivoId,
      conteudo,
      tipoMime: 'application/pdf',
    });
    return ok({
      arquivoId,
      paginas: extraido.paginas,
      analise: await this.analisar.executar(extraido.texto, tenantId),
    });
  }
}
