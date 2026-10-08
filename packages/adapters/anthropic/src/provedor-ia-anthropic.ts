import Anthropic from '@anthropic-ai/sdk';
import {
  definirDescritor,
  ErroPermanente,
  ErroSaidaInvalida,
  sinalDaChamada,
} from '@pz/integracoes';
import { z } from 'zod';

import { classificarErroAnthropic } from './erros.js';

import type { OpcoesIA, PromptIA, ProvedorIA, RespostaIA, SaudeAdaptador } from '@pz/integracoes';
import type { Clock } from '@pz/kernel';

const ID = 'anthropic';

/** Modelo padrão da classificação (card da HU21): Claude Haiku 4.5, trocável por configuração. */
export const MODELO_PADRAO = 'claude-haiku-4-5';

/**
 * Limites conservadores (nível inicial de uso da API): o registro aplica cota distribuída,
 * concorrência e timeout; a retentativa do SDK fica desligada.
 */
export const DESCRITOR_ANTHROPIC = definirDescritor({
  id: ID,
  porta: 'provedor-ia',
  versao: '1.0.0',
  capacidades: { saidaEstruturada: true, cachePrompt: true, ferramentas: true, lote: false },
  limites: { requisicoesPorMinuto: 50, concorrencia: 5, timeoutMs: 60_000 },
  requerCredenciais: true,
});

export interface ConfiguracaoAnthropic {
  /** Só por variável de ambiente ou cofre (nunca em código ou fixture). */
  readonly chave: string;
  /** Endereço da API; nos testes, o servidor local de fixtures. */
  readonly url?: string;
}

/**
 * ProvedorIA da Anthropic (HU21). A saída estruturada usa `output_config.format` (JSON Schema
 * gerado do schema Zod de quem chama) e é validada de novo aqui: o que não passar vira
 * `ErroSaidaInvalida`. Só envia o prompt recebido (minimização de dados é de `packages/ia`).
 */
export class ProvedorIaAnthropic implements ProvedorIA {
  readonly #cliente: Anthropic;

  constructor(
    configuracao: ConfiguracaoAnthropic,
    private readonly relogio: Clock,
  ) {
    this.#cliente = new Anthropic({
      apiKey: configuracao.chave,
      ...(configuracao.url === undefined ? {} : { baseURL: configuracao.url }),
      // Retentativa e timeout são do registro (ADR-005): o SDK não repete por conta própria.
      maxRetries: 0,
    });
  }

  async gerarEstruturado<Saida>(
    prompt: PromptIA,
    schema: z.ZodType<Saida>,
    opcoes: OpcoesIA,
  ): Promise<RespostaIA<Saida>> {
    let resposta: Anthropic.Message;
    try {
      resposta = await this.#cliente.messages.create(paraRequisicao(prompt, schema, opcoes), {
        signal: sinalDaChamada(),
      });
    } catch (erro) {
      throw classificarErroAnthropic(erro);
    }
    return converterResposta(resposta, schema);
  }

  async saude(): Promise<SaudeAdaptador> {
    try {
      await this.#cliente.models.list({ limit: 1 }, { signal: AbortSignal.timeout(5_000) });
      return { estado: 'operacional', verificadoEm: this.relogio.agora() };
    } catch (erro) {
      const classificado = classificarErroAnthropic(erro);
      return {
        estado: classificado instanceof ErroPermanente ? 'degradado' : 'indisponivel',
        verificadoEm: this.relogio.agora(),
        detalhe: classificado.message,
      };
    }
  }
}

/** Monta a requisição: sistema (com cache opcional), mensagens, ferramentas e formato da saída. */
export function paraRequisicao(
  prompt: PromptIA,
  schema: z.ZodType,
  opcoes: OpcoesIA,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: opcoes.modelo,
    max_tokens: opcoes.maxTokensSaida,
    ...(opcoes.temperatura === undefined ? {} : { temperature: opcoes.temperatura }),
    // O bloco estável (instruções e taxonomia) vai no sistema: é o que se repete e vale cachear.
    system: [
      {
        type: 'text',
        text: prompt.sistema,
        ...(opcoes.cachePrompt === true ? { cache_control: { type: 'ephemeral' as const } } : {}),
      },
    ],
    messages: prompt.mensagens.map((m) => ({
      role: m.papel === 'usuario' ? ('user' as const) : ('assistant' as const),
      content: m.conteudo,
    })),
    ...(opcoes.ferramentas === undefined || opcoes.ferramentas.length === 0
      ? {}
      : {
          tools: opcoes.ferramentas.map((f) => ({
            name: f.nome,
            description: f.descricao,
            input_schema: { type: 'object' as const, ...f.entrada },
          })),
        }),
    output_config: {
      format: { type: 'json_schema', schema: z.toJSONSchema(schema, { io: 'input' }) },
    },
  };
}

/** Converte a resposta da API no modelo da porta, validando a saída contra o schema. */
export function converterResposta<Saida>(
  resposta: Anthropic.Message,
  schema: z.ZodType<Saida>,
): RespostaIA<Saida> {
  if (resposta.stop_reason === 'refusal') {
    throw new ErroSaidaInvalida('Anthropic: o modelo recusou a tarefa', ID);
  }
  if (resposta.stop_reason === 'max_tokens') {
    throw new ErroSaidaInvalida('Anthropic: saída truncada pelo limite de tokens', ID);
  }
  const texto = resposta.content
    .flatMap((bloco) => (bloco.type === 'text' ? [bloco.text] : []))
    .join('');
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch (erro) {
    throw new ErroSaidaInvalida('Anthropic: a saída não é JSON', ID, { causa: erro });
  }
  const validada = schema.safeParse(json);
  if (!validada.success) {
    throw new ErroSaidaInvalida('Anthropic: a saída não segue o schema', ID, {
      causa: validada.error,
    });
  }
  const { usage } = resposta;
  return {
    saida: validada.data,
    modelo: resposta.model,
    uso: {
      // Escrita no cache conta como entrada (é cobrada); a leitura vem à parte, mais barata.
      tokensEntrada: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0),
      tokensSaida: usage.output_tokens,
      tokensCacheLidos: usage.cache_read_input_tokens ?? 0,
    },
    chamadasDeFerramenta: resposta.content.flatMap((bloco) =>
      bloco.type === 'tool_use' ? [{ nome: bloco.name, entrada: bloco.input }] : [],
    ),
  };
}
