import { err, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import type {
  CatalogoDeFerramentas,
  ContextoDaFerramenta,
  PlataformaIa,
  RegistroDePrompts,
} from '@pz/ia';
import type { ErroDominio, Result } from '@pz/kernel';

export const TAREFA_DE_ESCOLHA = 'escolher-ferramenta';

/** Saída do modelo: a ferramenta (ou nenhuma) e os argumentos, sem executar nada. */
export const EscolhaDoModelo = z
  .object({
    ferramenta: z.string().nullable(),
    argumentos: z.record(z.string(), z.unknown()),
    motivo: z.string().max(400),
  })
  .strict();

export interface EscolhaDeFerramenta {
  readonly ferramenta: string | null;
  /** Já validados pelo schema da ferramenta (vazios quando não há ferramenta). */
  readonly argumentos: unknown;
  readonly motivo: string;
  readonly versaoDoPrompt: string;
  readonly modelo: string;
}

/**
 * Escolhe, pelo modelo, a ferramenta do catálogo que responde à pergunta e monta os argumentos
 * (HU59). Só as ferramentas que o contexto pode usar entram no prompt; a escolha é validada de
 * novo pelo catálogo (ferramenta disponível e argumentos no schema). Não executa: quem executa é
 * o assistente (HU61), com o mesmo contexto autenticado.
 */
export class EscolherFerramenta {
  constructor(
    private readonly plataforma: Pick<PlataformaIa, 'executarTarefa'>,
    private readonly prompts: Pick<RegistroDePrompts, 'montar'>,
    private readonly catalogo: Pick<CatalogoDeFerramentas, 'disponiveis' | 'validarEntrada'>,
  ) {}

  async executar(
    pergunta: string,
    contexto: ContextoDaFerramenta,
  ): Promise<Result<EscolhaDeFerramenta, ErroDominio>> {
    const ferramentas = this.catalogo.disponiveis(contexto);
    const { prompt } = this.prompts.montar(TAREFA_DE_ESCOLHA, {
      ferramentas: JSON.stringify(ferramentas),
      pergunta,
    });
    const resposta = await this.plataforma.executarTarefa(
      TAREFA_DE_ESCOLHA,
      prompt,
      EscolhaDoModelo,
      {
        tenantId: contexto.tenantId,
      },
    );
    const { ferramenta, argumentos, motivo } = resposta.saida;
    const origem = { versaoDoPrompt: resposta.versaoDoPrompt, modelo: resposta.modelo, motivo };
    if (ferramenta === null) return ok({ ferramenta: null, argumentos: {}, ...origem });
    const validada = this.catalogo.validarEntrada(ferramenta, argumentos, contexto);
    if (!validada.ok) {
      return err(
        new Validacao(
          [{ campo: 'ferramenta', mensagem: `${ferramenta}: ${validada.erro.message}` }],
          'escolha-invalida',
        ),
      );
    }
    return ok({ ferramenta, argumentos: validada.valor, ...origem });
  }
}
