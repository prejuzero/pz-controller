import {
  definirDescritor,
  ErroPermanente,
  ErroSaidaInvalida,
  sinalDaChamada,
} from '@pz/integracoes';
import { z } from 'zod';

import { classificarFalhaDeRede, classificarStatusOpenAi } from './erros.js';

import type { OpcoesIA, PromptIA, ProvedorIA, RespostaIA, SaudeAdaptador } from '@pz/integracoes';
import type { Clock } from '@pz/kernel';

const ID = 'openai';
const URL_PADRAO = 'https://api.openai.com/v1';

/**
 * Provedor de IA da OpenAI (ADR-024): a API não usa os dados para treino por padrão. O registro
 * aplica cota, concorrência e timeout.
 */
export const DESCRITOR_OPENAI = definirDescritor({
  id: ID,
  porta: 'provedor-ia',
  versao: '1.0.0',
  capacidades: { saidaEstruturada: true, cachePrompt: false, ferramentas: false, lote: false },
  limites: { requisicoesPorMinuto: 60, concorrencia: 4, timeoutMs: 60_000 },
  requerCredenciais: true,
});

export interface ConfiguracaoOpenAi {
  /** Só por variável de ambiente (nunca em código, fixture ou log). */
  readonly chave: string;
  /** Endereço da API; nos testes, um servidor local. */
  readonly url?: string;
  /** Para teste; o padrão é o `fetch` global. */
  readonly fetch?: typeof fetch;
}

const papel = (p: 'usuario' | 'assistente') => (p === 'usuario' ? 'user' : 'assistant');

/**
 * Corpo do Chat Completions: sistema, mensagens e saída JSON pelo schema de quem chama. Sem
 * temperatura: os modelos de raciocínio só aceitam a padrão, e a saída é validada pelo schema.
 */
export function paraRequisicaoOpenAi(prompt: PromptIA, schema: z.ZodType, opcoes: OpcoesIA) {
  if (opcoes.ferramentas !== undefined && opcoes.ferramentas.length > 0) {
    throw new ErroPermanente('OpenAI: ferramentas não suportadas por este adaptador', ID);
  }
  return {
    model: opcoes.modelo,
    messages: [
      { role: 'system', content: prompt.sistema },
      ...prompt.mensagens.map((m) => ({ role: papel(m.papel), content: m.conteudo })),
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'saida',
        schema: z.toJSONSchema(schema, { io: 'input' }),
        strict: false,
      },
    },
    max_completion_tokens: opcoes.maxTokensSaida,
  };
}

const RespostaOpenAi = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z
          .object({
            content: z.string().nullable().optional(),
            refusal: z.string().nullable().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      prompt_tokens_details: z.object({ cached_tokens: z.number().optional() }).optional(),
    })
    .optional(),
});

/** Converte a resposta no modelo da porta, validando a saída contra o schema de quem chama. */
export function converterRespostaOpenAi<Saida>(
  bruta: unknown,
  schema: z.ZodType<Saida>,
  modeloPedido: string,
): RespostaIA<Saida> {
  const resposta = RespostaOpenAi.safeParse(bruta);
  if (!resposta.success) {
    throw new ErroSaidaInvalida('OpenAI: resposta fora do formato da API', ID, {
      causa: resposta.error,
    });
  }
  const { choices, usage, model } = resposta.data;
  const [escolha] = choices ?? [];
  if (escolha?.finish_reason === 'length') {
    throw new ErroSaidaInvalida('OpenAI: saída truncada pelo limite de tokens', ID);
  }
  const recusa = escolha?.message?.refusal;
  if (recusa !== undefined && recusa !== null && recusa !== '') {
    throw new ErroSaidaInvalida('OpenAI: o modelo recusou a resposta', ID);
  }
  if (escolha === undefined || (escolha.finish_reason ?? 'stop') !== 'stop') {
    throw new ErroSaidaInvalida(
      `OpenAI: sem resposta utilizável (${escolha?.finish_reason ?? 'sem escolha'})`,
      ID,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(escolha.message?.content ?? '');
  } catch (erro) {
    throw new ErroSaidaInvalida('OpenAI: a saída não é JSON', ID, { causa: erro });
  }
  const validada = schema.safeParse(json);
  if (!validada.success) {
    throw new ErroSaidaInvalida('OpenAI: a saída não segue o schema', ID, {
      causa: validada.error,
    });
  }
  return {
    saida: validada.data,
    modelo: model ?? modeloPedido,
    uso: {
      tokensEntrada: usage?.prompt_tokens ?? 0,
      tokensSaida: usage?.completion_tokens ?? 0,
      tokensCacheLidos: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
    chamadasDeFerramenta: [],
  };
}

/**
 * ProvedorIA da OpenAI pela API REST (`/chat/completions`), sem SDK. Saída estruturada por
 * `response_format` (schema gerado do Zod) e validada de novo aqui. Só envia o prompt recebido; a
 * minimização de dados é de `packages/ia`. A chave vai no cabeçalho, nunca na URL ou em log.
 */
export class ProvedorIaOpenAi implements ProvedorIA {
  readonly #url: string;
  readonly #fetch: typeof fetch;

  constructor(
    private readonly configuracao: ConfiguracaoOpenAi,
    private readonly relogio: Clock,
  ) {
    this.#url = (configuracao.url ?? URL_PADRAO).replace(/\/+$/, '');
    this.#fetch = configuracao.fetch ?? fetch;
  }

  async gerarEstruturado<Saida>(
    prompt: PromptIA,
    schema: z.ZodType<Saida>,
    opcoes: OpcoesIA,
  ): Promise<RespostaIA<Saida>> {
    const sinal = sinalDaChamada();
    const bruta = await this.#chamar('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(paraRequisicaoOpenAi(prompt, schema, opcoes)),
      ...(sinal === undefined ? {} : { signal: sinal }),
    });
    return converterRespostaOpenAi(bruta, schema, opcoes.modelo);
  }

  async saude(): Promise<SaudeAdaptador> {
    try {
      await this.#chamar('/models', { method: 'GET', signal: AbortSignal.timeout(5_000) });
      return { estado: 'operacional', verificadoEm: this.relogio.agora() };
    } catch (erro) {
      return {
        estado: erro instanceof ErroPermanente ? 'degradado' : 'indisponivel',
        verificadoEm: this.relogio.agora(),
        detalhe: erro instanceof Error ? erro.message : 'OpenAI: erro desconhecido',
      };
    }
  }

  async #chamar(caminho: string, init: RequestInit): Promise<unknown> {
    let resposta: Response;
    try {
      resposta = await this.#fetch(`${this.#url}${caminho}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.configuracao.chave}`,
        },
      });
    } catch (erro) {
      throw classificarFalhaDeRede(erro);
    }
    const texto = await resposta.text();
    if (!resposta.ok) throw classificarStatusOpenAi(resposta.status);
    try {
      return JSON.parse(texto) as unknown;
    } catch (erro) {
      throw new ErroSaidaInvalida('OpenAI: resposta da API não é JSON', ID, { causa: erro });
    }
  }
}
