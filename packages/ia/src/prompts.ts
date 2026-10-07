import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ErroPermanente, type PromptIA } from '@pz/integracoes';
import { z } from 'zod';

const SemVer = z.string().regex(/^\d+\.\d+\.\d+$/, 'versão semântica (ex.: 1.2.0)');

/**
 * Arquivo de prompt versionado (HU58): um por tarefa, com versão semântica e changelog. O hash
 * do conteúdo fica na entrada do changelog da versão atual: mudar o texto sem subir a versão e
 * registrar a mudança falha nos testes (e, com a HU22, dispara a avaliação).
 */
export const ArquivoDePrompt = z
  .object({
    tarefa: z.string().regex(/^[a-z][a-z0-9-]*$/),
    versao: SemVer,
    sistema: z.string().min(1),
    /** Modelo da mensagem do usuário, com variáveis `{{nome}}`. */
    usuario: z.string().min(1),
    changelog: z
      .array(
        z
          .object({
            versao: SemVer,
            data: z.iso.date(),
            mudanca: z.string().min(1),
            /** SHA-256 de `sistema` + `usuario` nesta versão. */
            hash: z.string().regex(/^[0-9a-f]{64}$/),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type ArquivoDePrompt = z.infer<typeof ArquivoDePrompt>;

/** Hash do conteúdo de um prompt (o que, se mudar, exige nova versão). */
export function hashDoPrompt(prompt: Pick<ArquivoDePrompt, 'sistema' | 'usuario'>): string {
  return createHash('sha256')
    .update(`${prompt.sistema}\n---\n${prompt.usuario}`, 'utf8')
    .digest('hex');
}

/** Problemas de versionamento do arquivo (vazio quando está tudo certo). */
export function problemasDeVersao(arquivo: ArquivoDePrompt): string[] {
  const atual = arquivo.changelog.find((entrada) => entrada.versao === arquivo.versao);
  if (atual === undefined) return [`${arquivo.tarefa}: changelog sem a versão ${arquivo.versao}`];
  if (atual.hash !== hashDoPrompt(arquivo)) {
    return [`${arquivo.tarefa}: conteúdo mudou sem nova versão no changelog (${arquivo.versao})`];
  }
  return [];
}

const VARIAVEL = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

/** Prompts por tarefa, lidos e validados no boot (erro de arquivo derruba o processo). */
export class RegistroDePrompts {
  readonly #porTarefa: ReadonlyMap<string, ArquivoDePrompt>;

  constructor(arquivos: readonly ArquivoDePrompt[]) {
    const porTarefa = new Map<string, ArquivoDePrompt>();
    for (const arquivo of arquivos) {
      const problemas = problemasDeVersao(arquivo);
      if (problemas.length > 0) throw new Error(problemas.join('; '));
      if (porTarefa.has(arquivo.tarefa)) throw new Error(`Prompt duplicado: ${arquivo.tarefa}`);
      porTarefa.set(arquivo.tarefa, arquivo);
    }
    this.#porTarefa = porTarefa;
  }

  /** Lê todos os `*.json` de um diretório (padrão: `packages/ia/prompts`). */
  static doDiretorio(diretorio: string): RegistroDePrompts {
    return new RegistroDePrompts(
      readdirSync(diretorio)
        .filter((nome) => nome.endsWith('.json'))
        .sort()
        .map((nome) =>
          ArquivoDePrompt.parse(JSON.parse(readFileSync(join(diretorio, nome), 'utf8'))),
        ),
    );
  }

  versao(tarefa: string): string {
    return `${tarefa}@${this.#arquivo(tarefa).versao}`;
  }

  /**
   * Monta o prompt da tarefa. Variável faltando ou sobrando é erro: nada de prompt incompleto
   * chegando ao modelo. A versão vai junto (`tarefa@x.y.z`) e é registrada em toda chamada.
   */
  montar(tarefa: string, variaveis: Readonly<Record<string, string>>): PromptIA {
    const arquivo = this.#arquivo(tarefa);
    const esperadas = new Set([...arquivo.usuario.matchAll(VARIAVEL)].map(([, nome]) => nome));
    const recebidas = Object.keys(variaveis);
    const faltando = [...esperadas].filter((nome) => nome !== undefined && !(nome in variaveis));
    const sobrando = recebidas.filter((nome) => !esperadas.has(nome));
    if (faltando.length > 0 || sobrando.length > 0) {
      throw new ErroPermanente(
        `Prompt ${tarefa}: variáveis faltando [${faltando.join(', ')}], sobrando [${sobrando.join(', ')}]`,
        'ia',
      );
    }
    return {
      versao: this.versao(tarefa),
      sistema: arquivo.sistema,
      mensagens: [
        {
          papel: 'usuario',
          conteudo: arquivo.usuario.replace(
            VARIAVEL,
            (_inteira, nome: string) => variaveis[nome] ?? '',
          ),
        },
      ],
    };
  }

  #arquivo(tarefa: string): ArquivoDePrompt {
    const arquivo = this.#porTarefa.get(tarefa);
    if (arquivo === undefined) throw new ErroPermanente(`Prompt sem arquivo: ${tarefa}`, 'ia');
    return arquivo;
  }
}
