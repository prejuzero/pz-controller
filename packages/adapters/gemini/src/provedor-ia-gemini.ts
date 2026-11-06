import {
  definirDescritor,
  ErroPermanente,
  ErroSaidaInvalida,
  sinalDaChamada,
} from '@pz/integracoes';
import { z } from 'zod';

import { classificarFalhaDeRede, classificarStatusGemini } from './erros.js';

import type { OpcoesIA, PromptIA, ProvedorIA, RespostaIA, SaudeAdaptador } from '@pz/integracoes';
import type { Clock } from '@pz/kernel';

const ID = 'gemini';
const URL_PADRAO = 'https://generativelanguage.googleapis.com/v1beta';

/** Modelo estável e barato da família Flash; trocável por configuração (GEMINI_MODELO). */
export const MODELO_PADRAO_GEMINI = 'gemini-3.5-flash';

/**
 * Provedor alternativo (ADR-022): só na validação local, com dados fictícios. Limites
 * conservadores para a chave gratuita e limitada; o registro aplica cota, concorrência e timeout.
 */
export const DESCRITOR_GEMINI = definirDescritor({
  id: ID,
  porta: 'provedor-ia',
  versao: '1.0.0',
  capacidades: { saidaEstruturada: true, cachePrompt: false, ferramentas: false, lote: false },
  limites: { requisicoesPorMinuto: 10, concorrencia: 2, timeoutMs: 60_000 },
  requerCredenciais: true,
});

export interface ConfiguracaoGemini {
  /** Só por variável de ambiente (nunca em código, fixture ou log). */
  readonly chave: string;
  /** Endereço da API; nos testes, o servidor local de fixtures. */
  readonly url?: string;
  /** Para teste; o padrão é o `fetch` global. */
  readonly fetch?: typeof fetch;
}

/** Corpo do generateContent: sistema, mensagens e saída JSON pelo schema de quem chama. */
export function paraRequisicaoGemini(prompt: PromptIA, schema: z.ZodType, opcoes: OpcoesIA) {
  if (opcoes.ferramentas !== undefined && opcoes.ferramentas.length > 0) {
    throw new ErroPermanente('Gemini: ferramentas não suportadas por este adaptador', ID);
  }
  return {
    systemInstruction: { parts: [{ text: prompt.sistema }] },
    contents: prompt.mensagens.map((m) => ({
      role: m.papel === 'usuario' ? 'user' : 'model',
      parts: [{ text: m.conteudo }],
    })),
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(schema, { io: 'input' }),
      maxOutputTokens: opcoes.maxTokensSaida,
      ...(opcoes.temperatura === undefined ? {} : { temperature: opcoes.temperatura }),
    },
  };
}

const RespostaGemini = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional(), thought: z.boolean().optional() }))
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      thoughtsTokenCount: z.number().optional(),
      cachedContentTokenCount: z.number().optional(),
    })
    .optional(),
  modelVersion: z.string().optional(),
});

/** Converte a resposta no modelo da porta, validando a saída contra o schema de quem chama. */
export function converterRespostaGemini<Saida>(
  bruta: unknown,
  schema: z.ZodType<Saida>,
  modeloPedido: string,
): RespostaIA<Saida> {
  const resposta = RespostaGemini.safeParse(bruta);
  if (!resposta.success) {
    throw new ErroSaidaInvalida('Gemini: resposta fora do formato da API', ID, {
      causa: resposta.error,
    });
  }
  const { candidates, promptFeedback, usageMetadata, modelVersion } = resposta.data;
  if (promptFeedback?.blockReason !== undefined) {
    throw new ErroSaidaInvalida(`Gemini: prompt bloqueado (${promptFeedback.blockReason})`, ID);
  }
  const [candidato] = candidates ?? [];
  if (candidato?.finishReason === 'MAX_TOKENS') {
    throw new ErroSaidaInvalida('Gemini: saída truncada pelo limite de tokens', ID);
  }
  if (candidato === undefined || (candidato.finishReason ?? 'STOP') !== 'STOP') {
    throw new ErroSaidaInvalida(
      `Gemini: sem resposta utilizável (${candidato?.finishReason ?? 'sem candidato'})`,
      ID,
    );
  }
  // O raciocínio ("thought") não é saída: só as partes de texto da resposta.
  const texto = (candidato.content?.parts ?? [])
    .filter((p) => p.thought !== true)
    .map((p) => p.text ?? '')
    .join('');
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch (erro) {
    throw new ErroSaidaInvalida('Gemini: a saída não é JSON', ID, { causa: erro });
  }
  const validada = schema.safeParse(json);
  if (!validada.success) {
    throw new ErroSaidaInvalida('Gemini: a saída não segue o schema', ID, {
      causa: validada.error,
    });
  }
  return {
    saida: validada.data,
    modelo: modelVersion ?? modeloPedido,
    uso: {
      tokensEntrada: usageMetadata?.promptTokenCount ?? 0,
      // Raciocínio é cobrado como saída.
      tokensSaida:
        (usageMetadata?.candidatesTokenCount ?? 0) + (usageMetadata?.thoughtsTokenCount ?? 0),
      tokensCacheLidos: usageMetadata?.cachedContentTokenCount ?? 0,
    },
    chamadasDeFerramenta: [],
  };
}

/**
 * ProvedorIA do Google Gemini pela API REST (`generateContent`), sem SDK. Saída estruturada por
 * `responseJsonSchema` (gerado do schema Zod) e validada de novo aqui. Só envia o prompt
 * recebido; a minimização de dados é de `packages/ia`. A chave vai no cabeçalho, nunca na URL.
 */
export class ProvedorIaGemini implements ProvedorIA {
  readonly #url: string;
  readonly #fetch: typeof fetch;

  constructor(
    private readonly configuracao: ConfiguracaoGemini,
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
    const corpo = paraRequisicaoGemini(prompt, schema, opcoes);
    const sinal = sinalDaChamada();
    const bruta = await this.#chamar(
      `/models/${encodeURIComponent(opcoes.modelo)}:generateContent`,
      {
        method: 'POST',
        body: JSON.stringify(corpo),
        ...(sinal === undefined ? {} : { signal: sinal }),
      },
    );
    return converterRespostaGemini(bruta, schema, opcoes.modelo);
  }

  async saude(): Promise<SaudeAdaptador> {
    try {
      await this.#chamar('/models?pageSize=1', {
        method: 'GET',
        signal: AbortSignal.timeout(5_000),
      });
      return { estado: 'operacional', verificadoEm: this.relogio.agora() };
    } catch (erro) {
      return {
        estado: erro instanceof ErroPermanente ? 'degradado' : 'indisponivel',
        verificadoEm: this.relogio.agora(),
        detalhe: erro instanceof Error ? erro.message : 'Gemini: erro desconhecido',
      };
    }
  }

  async #chamar(caminho: string, init: RequestInit): Promise<unknown> {
    let resposta: Response;
    try {
      resposta = await this.#fetch(`${this.#url}${caminho}`, {
        ...init,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.configuracao.chave },
      });
    } catch (erro) {
      throw classificarFalhaDeRede(erro);
    }
    const texto = await resposta.text();
    if (!resposta.ok) throw classificarStatusGemini(resposta.status, texto);
    try {
      return JSON.parse(texto) as unknown;
    } catch (erro) {
      throw new ErroSaidaInvalida('Gemini: resposta da API não é JSON', ID, { causa: erro });
    }
  }
}
