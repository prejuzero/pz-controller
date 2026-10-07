import { ErroIntegracao, ErroPermanente } from '@pz/integracoes';

import type { ConfiguracaoDaTarefa, ConfiguracaoDasTarefas } from './configuracao.js';
import type { OpcoesIA, PromptIA, ProvedorIA, RespostaIA } from '@pz/integracoes';
import type { z } from 'zod';

/** Erros que levam ao próximo modelo: o provedor está fora, sobrecarregado ou sem cota. */
const TIPOS_COM_FALLBACK = new Set(['transitorio', 'limite-excedido']);

export interface ResultadoDaTarefa<Saida> extends RespostaIA<Saida> {
  readonly tarefa: string;
  readonly provedor: string;
  readonly versaoDoPrompt: string;
  readonly versaoDaConfiguracao: string;
  /** Modelos tentados antes do que respondeu (vazio quando o primário respondeu). */
  readonly falhasAnteriores: readonly { readonly modelo: string; readonly erro: string }[];
}

/**
 * Plataforma de IA (HU58): toda funcionalidade chama por tarefa, nunca por modelo. Os provedores
 * chegam já com a resiliência do registro de adaptadores (ADR-005); aqui fica o roteamento por
 * tarefa, o fallback entre modelos e provedores, o cache de prompt e o lote. Não há operação de
 * data nem de fundamento legal (ADR-008, ADR-016).
 */
export class PlataformaIa {
  constructor(
    private readonly configuracao: ConfiguracaoDasTarefas,
    private readonly provedores: ReadonlyMap<string, ProvedorIA>,
  ) {
    for (const [nome, tarefa] of Object.entries(configuracao.tarefas)) {
      for (const { provedor } of tarefa.modelos) {
        if (!provedores.has(provedor)) {
          throw new Error(`Tarefa de IA ${nome} usa o provedor ${provedor}, não registrado.`);
        }
      }
    }
  }

  /**
   * Executa a tarefa com saída validada pelo schema. Erro transitório, cota ou circuito aberto
   * passam ao próximo modelo; os demais (saída inválida, credencial, pedido) sobem na hora.
   */
  async executarTarefa<Saida>(
    nome: string,
    prompt: PromptIA,
    schema: z.ZodType<Saida>,
  ): Promise<ResultadoDaTarefa<Saida>> {
    const tarefa = this.#tarefa(nome);
    const falhas: { modelo: string; erro: string }[] = [];
    let ultimoErro: unknown;
    for (const { provedor, modelo } of tarefa.modelos) {
      try {
        const resposta = await this.#provedor(provedor).gerarEstruturado(
          prompt,
          schema,
          this.#opcoes(tarefa, modelo),
        );
        return {
          ...resposta,
          tarefa: nome,
          provedor,
          versaoDoPrompt: prompt.versao,
          versaoDaConfiguracao: this.configuracao.versao,
          falhasAnteriores: falhas,
        };
      } catch (erro) {
        if (!(erro instanceof ErroIntegracao) || !TIPOS_COM_FALLBACK.has(erro.tipo)) throw erro;
        ultimoErro = erro;
        falhas.push({ modelo, erro: erro.message });
      }
    }
    throw ultimoErro;
  }

  /**
   * Envia um lote (trabalho assíncrono de alto volume) ao primeiro modelo da tarefa cujo
   * provedor aceita lote. Tarefa sem lote habilitado ou sem provedor com lote: erro explícito.
   */
  async enviarLote(
    nome: string,
    itens: readonly { readonly id: string; readonly prompt: PromptIA }[],
  ): Promise<{ readonly loteId: string; readonly provedor: string; readonly modelo: string }> {
    const tarefa = this.#tarefa(nome);
    if (!tarefa.lote) throw new ErroPermanente(`Tarefa de IA ${nome} não usa lote`, 'ia');
    for (const { provedor, modelo } of tarefa.modelos) {
      const alvo = this.#provedor(provedor);
      if (alvo.enviarLote === undefined) continue;
      const opcoes = this.#opcoes(tarefa, modelo);
      const loteId = await alvo.enviarLote(itens.map(({ id, prompt }) => ({ id, prompt, opcoes })));
      return { loteId, provedor, modelo };
    }
    throw new ErroPermanente(`Nenhum provedor da tarefa ${nome} aceita lote`, 'ia');
  }

  #tarefa(nome: string): ConfiguracaoDaTarefa {
    const tarefa = this.configuracao.tarefas[nome];
    if (tarefa === undefined) throw new ErroPermanente(`Tarefa de IA desconhecida: ${nome}`, 'ia');
    return tarefa;
  }

  #provedor(id: string): ProvedorIA {
    const provedor = this.provedores.get(id);
    // O construtor já garante; a checagem cobre um mapa alterado depois.
    if (provedor === undefined) throw new Error(`Provedor de IA ${id} não registrado.`);
    return provedor;
  }

  #opcoes(tarefa: ConfiguracaoDaTarefa, modelo: string): OpcoesIA {
    return {
      modelo,
      maxTokensSaida: tarefa.maxTokensSaida,
      cachePrompt: tarefa.cachePrompt,
      ...(tarefa.temperatura === undefined ? {} : { temperatura: tarefa.temperatura }),
    };
  }
}
