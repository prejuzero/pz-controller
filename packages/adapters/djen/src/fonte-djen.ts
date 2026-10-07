import {
  definirDescritor,
  ErroPermanente,
  ErroIntegracao,
  NumeroCnj,
  Oab,
  sinalDaChamada,
  type FontePublicacoes,
  type JanelaDeBusca,
  type PublicacaoCapturada,
  type SaudeAdaptador,
} from '@pz/integracoes';
import { LocalDate, type Clock } from '@pz/kernel';
import { z } from 'zod';

import { classificarFalhaDeRede, classificarStatusDjen, ID_DJEN } from './erros.js';
import { hashDoTeor, normalizarTeor } from './teor.js';

/**
 * Descritor do DJEN. Limite de 20 requisições por minuto: valor do cabeçalho
 * `x-ratelimit-limit` da API pública em 07/10/2026 (sem documentação oficial publicada); a
 * concorrência 1 evita estourar a cota numa rajada. Sem credencial: a API é pública.
 */
export const DESCRITOR_DJEN = definirDescritor({
  id: ID_DJEN,
  porta: 'fonte-publicacoes',
  versao: '1.0.0',
  capacidades: { porOab: true, porProcesso: true, webhooks: false },
  limites: { requisicoesPorMinuto: 20, concorrencia: 1, timeoutMs: 30_000 },
  requerCredenciais: false,
});

export const URL_PADRAO_DJEN = 'https://comunicaapi.pje.jus.br';
/** Fuso da "data de hoje" usada só na sondagem de saúde. */
const FUSO = 'America/Sao_Paulo';
/** Teto de páginas por consulta: acima disso a janela é grande demais e precisa ser dividida. */
const MAXIMO_DE_PAGINAS = 100;

const Texto = z.string().nullable().optional();
const ItemDjen = z.object({
  id: z.union([z.number(), z.string().min(1)]).transform(String),
  data_disponibilizacao: z.string(),
  texto: z.string(),
  hash: z.string().min(1),
  numeroprocessocommascara: Texto,
  siglaTribunal: Texto,
  tipoComunicacao: Texto,
  tipoDocumento: Texto,
  nomeOrgao: Texto,
  nomeClasse: Texto,
  meio: Texto,
  link: Texto,
  numeroComunicacao: z.number().nullable().optional(),
  ativo: z.boolean().nullable().optional(),
  status: Texto,
  data_cancelamento: Texto,
  destinatarioadvogados: z
    .array(z.object({ advogado: z.object({ numero_oab: z.string(), uf_oab: z.string() }) }))
    .default([]),
});
type ItemDjen = z.infer<typeof ItemDjen>;
const RespostaDjen = z.object({
  status: z.literal('success'),
  count: z.number().int().nonnegative(),
  items: z.array(ItemDjen),
});

export interface ConfiguracaoDjen {
  readonly relogio: Clock;
  /** Sem barra final; padrão: API pública do CNJ. */
  readonly urlBase?: string;
  /** Base do link da certidão mostrado ao usuário (sempre HTTPS); padrão: `urlBase`. */
  readonly urlPublica?: string;
  readonly itensPorPagina?: number;
  /** Injeção para testes com fixtures gravadas; padrão: `fetch` global. */
  readonly fetch?: typeof fetch;
}

/**
 * Fonte de publicações sobre a API pública de comunicações do CNJ (DJEN). Só lê a lista de
 * comunicações; nunca abre o expediente no tribunal, o que dispararia a ciência (CLAUDE.md, 3).
 * Retentativa, timeout, circuito e cota ficam com o registro (ADR-005).
 */
export class FontePublicacoesDjen implements FontePublicacoes {
  readonly #urlBase: string;
  readonly #urlPublica: string;
  readonly #porPagina: number;
  readonly #fetch: typeof fetch;

  constructor(private readonly config: ConfiguracaoDjen) {
    this.#urlBase = config.urlBase ?? URL_PADRAO_DJEN;
    this.#urlPublica = config.urlPublica ?? this.#urlBase;
    this.#porPagina = config.itensPorPagina ?? 100;
    this.#fetch = config.fetch ?? fetch;
  }

  buscarPorOab(oab: Oab, janela: JanelaDeBusca): Promise<PublicacaoCapturada[]> {
    return this.#buscar({ numeroOab: oab.numero, ufOab: oab.uf }, janela);
  }

  buscarPorProcesso(numeroCnj: NumeroCnj, janela: JanelaDeBusca): Promise<PublicacaoCapturada[]> {
    return this.#buscar({ numeroProcesso: numeroCnj.replace(/\D/g, '') }, janela);
  }

  async saude(): Promise<SaudeAdaptador> {
    const verificadoEm = this.config.relogio.agora();
    const hoje = LocalDate.doInstante(verificadoEm, FUSO).paraIso();
    try {
      await this.#pagina({
        siglaTribunal: 'TJSP',
        dataDisponibilizacaoInicio: hoje,
        dataDisponibilizacaoFim: hoje,
        pagina: '1',
        itensPorPagina: '1',
      });
      return { estado: 'operacional', verificadoEm };
    } catch (erro) {
      if (!(erro instanceof ErroIntegracao)) throw erro;
      const estado = erro.tipo === 'limite-excedido' ? 'degradado' : 'indisponivel';
      return { estado, verificadoEm, detalhe: erro.message };
    }
  }

  async #buscar(
    filtro: Readonly<Record<string, string>>,
    janela: JanelaDeBusca,
  ): Promise<PublicacaoCapturada[]> {
    const porId = new Map<string, PublicacaoCapturada>();
    for (let pagina = 1; ; pagina++) {
      if (pagina > MAXIMO_DE_PAGINAS) {
        throw new ErroPermanente(
          `DJEN: mais de ${String(MAXIMO_DE_PAGINAS)} páginas; divida a janela de busca`,
          ID_DJEN,
        );
      }
      const resposta = await this.#pagina({
        ...filtro,
        dataDisponibilizacaoInicio: janela.inicio.paraIso(),
        dataDisponibilizacaoFim: janela.fim.paraIso(),
        pagina: String(pagina),
        itensPorPagina: String(this.#porPagina),
      });
      // A lista pode mudar entre páginas; o id do DJEN deduplica a sobreposição.
      for (const item of resposta.items) porId.set(item.id, this.#canonica(item));
      if (resposta.items.length < this.#porPagina || porId.size >= resposta.count) break;
    }
    return [...porId.values()];
  }

  async #pagina(consulta: Readonly<Record<string, string>>): Promise<z.infer<typeof RespostaDjen>> {
    const url = `${this.#urlBase}/api/v1/comunicacao?${new URLSearchParams(consulta).toString()}`;
    let resposta: Response;
    try {
      const sinal = sinalDaChamada();
      resposta = await this.#fetch(url, {
        headers: { accept: 'application/json' },
        ...(sinal === undefined ? {} : { signal: sinal }),
      });
    } catch (erro) {
      throw classificarFalhaDeRede(erro);
    }
    if (!resposta.ok) {
      throw classificarStatusDjen(resposta.status, resposta.headers.get('retry-after'));
    }
    let corpo: unknown;
    try {
      corpo = await resposta.json();
    } catch (erro) {
      throw new ErroPermanente('DJEN devolveu corpo que não é JSON', ID_DJEN, { causa: erro });
    }
    const lido = RespostaDjen.safeParse(corpo);
    if (!lido.success) {
      // Só os caminhos dos campos: o corpo traz nomes e teor, que não vão para o log.
      const campos = lido.error.issues.map((problema) => problema.path.join('.')).join(', ');
      throw new ErroPermanente(`DJEN devolveu resposta fora do formato (${campos})`, ID_DJEN, {
        causa: lido.error,
      });
    }
    return lido.data;
  }

  #canonica(item: ItemDjen): PublicacaoCapturada {
    const data = LocalDate.analisar(item.data_disponibilizacao);
    if (!data.ok) {
      throw new ErroPermanente(
        `DJEN: data de disponibilização inválida no item ${item.id}`,
        ID_DJEN,
      );
    }
    const teor = normalizarTeor(item.texto);
    if (teor === '') throw new ErroPermanente(`DJEN: item ${item.id} sem teor`, ID_DJEN);
    const numero = NumeroCnj.safeParse(item.numeroprocessocommascara);
    const destinatarios = new Map<string, { oab: Oab }>();
    for (const { advogado } of item.destinatarioadvogados) {
      // Inscrição fora do padrão numérico (ex.: suplementar com letra) fica só nos metadados.
      const oab = Oab.safeParse({ numero: advogado.numero_oab.trim(), uf: advogado.uf_oab.trim() });
      if (oab.success) destinatarios.set(`${oab.data.numero}/${oab.data.uf}`, { oab: oab.data });
    }
    return {
      fonte: ID_DJEN,
      idExterno: item.id,
      hashConteudo: hashDoTeor(teor),
      dataDisponibilizacao: data.valor,
      teor,
      ...(numero.success ? { numeroCnj: numero.data } : {}),
      destinatarios: [...destinatarios.values()],
      // Certidão pública do DJEN; o `link` do tribunal (expediente) nunca é aberto pelo conector.
      urlFonte: `${this.#urlPublica}/api/v1/comunicacao/${encodeURIComponent(item.hash)}/certidao`,
      metadados: {
        hashDjen: item.hash,
        siglaTribunal: item.siglaTribunal ?? null,
        tipoComunicacao: item.tipoComunicacao ?? null,
        tipoDocumento: item.tipoDocumento ?? null,
        nomeOrgao: item.nomeOrgao ?? null,
        nomeClasse: item.nomeClasse ?? null,
        meio: item.meio ?? null,
        numeroComunicacao: item.numeroComunicacao ?? null,
        ativo: item.ativo ?? null,
        status: item.status ?? null,
        dataCancelamento: item.data_cancelamento ?? null,
        linkTribunal: item.link ?? null,
        advogados: item.destinatarioadvogados.map(({ advogado }) => ({
          numeroOab: advogado.numero_oab,
          ufOab: advogado.uf_oab,
        })),
      },
    };
  }
}
