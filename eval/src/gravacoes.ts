import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErroPermanente } from '@pz/integracoes';
import { z } from 'zod';

import type { OpcoesIA, PromptIA, ProvedorIA, RespostaIA, SaudeAdaptador } from '@pz/integracoes';
import type { Clock } from '@pz/kernel';

export const PASTA_DAS_GRAVACOES = fileURLToPath(new URL('../gravacoes', import.meta.url));

/**
 * Resposta do modelo gravada com a chave real (`pnpm eval --gravar`), para o CI repetir a
 * avaliação sem rede e sem custo (CLAUDE.md, seção 10). A saída bruta é guardada e validada de
 * novo pelo schema na reprodução, como faz o adaptador.
 */
export const Gravacao = z
  .object({
    /** Só para leitura humana do arquivo; a chave é o hash da chamada. */
    caso: z.string(),
    modelo: z.string().min(1),
    latenciaMs: z.number().nonnegative(),
    resultado: z.discriminatedUnion('tipo', [
      z
        .object({
          tipo: z.literal('ok'),
          saida: z.unknown(),
          modeloQueRespondeu: z.string().min(1),
          uso: z
            .object({
              tokensEntrada: z.number().int().nonnegative(),
              tokensSaida: z.number().int().nonnegative(),
              tokensCacheLidos: z.number().int().nonnegative(),
            })
            .strict(),
        })
        .strict(),
      z.object({ tipo: z.literal('saida-invalida'), mensagem: z.string() }).strict(),
    ]),
  })
  .strict();
export type Gravacao = z.infer<typeof Gravacao>;

export const ArquivoDeGravacoes = z.record(z.string().regex(/^[0-9a-f]{64}$/), Gravacao);
export type ArquivoDeGravacoes = z.infer<typeof ArquivoDeGravacoes>;

/** Um arquivo por versão do prompt (`classificar-ato@0.1.0.json`). */
export const arquivoDasGravacoes = (versaoDoPrompt: string, pasta = PASTA_DAS_GRAVACOES) =>
  join(pasta, `${versaoDoPrompt}.json`);

export function lerGravacoes(caminho: string): ArquivoDeGravacoes {
  return existsSync(caminho)
    ? ArquivoDeGravacoes.parse(JSON.parse(readFileSync(caminho, 'utf8')))
    : {};
}

/**
 * Chave da chamada: muda quando muda o prompt (texto, versão, taxonomia ou teor) ou o modelo e
 * seus parâmetros. Gravação velha não serve para a configuração nova.
 */
export function chaveDaChamada(prompt: PromptIA, opcoes: OpcoesIA): string {
  const { modelo, maxTokensSaida, temperatura = null } = opcoes;
  return createHash('sha256')
    .update(JSON.stringify({ prompt, modelo, maxTokensSaida, temperatura }))
    .digest('hex');
}

/** Falta gravação para a chamada: regravar com a chave (nunca vira acerto nem erro do modelo). */
export class SemGravacao extends Error {
  constructor(readonly modelo: string) {
    super(`Sem resposta gravada para ${modelo} nesta configuração: rode "pnpm eval --gravar".`);
    this.name = 'SemGravacao';
  }
}

interface Chamadas {
  /** Gravações usadas (ou feitas) desde o início, na ordem: o runner tira latência e custo daqui. */
  readonly chamadas: Gravacao[];
  /** Caso em avaliação, para identificar a gravação no arquivo. */
  casoAtual: string;
}

const respostaDa = <Saida>(g: Gravacao, schema: z.ZodType<Saida>): RespostaIA<Saida> => {
  if (g.resultado.tipo === 'saida-invalida') throw new ErroPermanente(g.resultado.mensagem, 'ia');
  const saida = schema.safeParse(g.resultado.saida);
  if (!saida.success) throw new ErroPermanente('Saída gravada fora do schema', 'ia');
  return {
    saida: saida.data,
    modelo: g.resultado.modeloQueRespondeu,
    uso: g.resultado.uso,
    chamadasDeFerramenta: [],
  };
};

/** Reproduz as respostas gravadas; chamada sem gravação lança `SemGravacao`. */
export class ProvedorGravado implements ProvedorIA, Chamadas {
  readonly chamadas: Gravacao[] = [];
  casoAtual = '';

  constructor(
    private readonly gravacoes: ArquivoDeGravacoes,
    private readonly relogio: Clock,
  ) {}

  gerarEstruturado<Saida>(
    prompt: PromptIA,
    schema: z.ZodType<Saida>,
    opcoes: OpcoesIA,
  ): Promise<RespostaIA<Saida>> {
    const gravacao = this.gravacoes[chaveDaChamada(prompt, opcoes)];
    if (gravacao === undefined) return Promise.reject(new SemGravacao(opcoes.modelo));
    this.chamadas.push(gravacao);
    return Promise.resolve().then(() => respostaDa(gravacao, schema));
  }

  saude(): Promise<SaudeAdaptador> {
    return Promise.resolve({ estado: 'operacional', verificadoEm: this.relogio.agora() });
  }
}

/**
 * Passa a chamada ao provedor real e grava a resposta. Só saída válida e saída inválida
 * (ErroPermanente) são gravadas; falha transitória sobe sem gravar.
 */
export class GravadorDeProvedor implements ProvedorIA, Chamadas {
  readonly chamadas: Gravacao[] = [];
  readonly gravacoes: ArquivoDeGravacoes = {};
  casoAtual = '';

  constructor(
    private readonly real: ProvedorIA,
    private readonly relogio: Clock,
  ) {}

  async gerarEstruturado<Saida>(
    prompt: PromptIA,
    schema: z.ZodType<Saida>,
    opcoes: OpcoesIA,
  ): Promise<RespostaIA<Saida>> {
    const inicio = this.relogio.agora().epochMs;
    const gravar = (resultado: Gravacao['resultado']) => {
      const gravacao: Gravacao = {
        caso: this.casoAtual,
        modelo: opcoes.modelo,
        latenciaMs: this.relogio.agora().epochMs - inicio,
        resultado,
      };
      this.gravacoes[chaveDaChamada(prompt, opcoes)] = gravacao;
      this.chamadas.push(gravacao);
    };
    try {
      const resposta = await this.real.gerarEstruturado(prompt, schema, opcoes);
      gravar({
        tipo: 'ok',
        saida: resposta.saida,
        modeloQueRespondeu: resposta.modelo,
        uso: resposta.uso,
      });
      return resposta;
    } catch (erro) {
      if (erro instanceof ErroPermanente)
        gravar({ tipo: 'saida-invalida', mensagem: erro.message });
      throw erro;
    }
  }

  saude() {
    return this.real.saude();
  }
}

export type ProvedorDaAvaliacao = ProvedorGravado | GravadorDeProvedor;
