import { err, NaoEncontrado, ok, Proibido, Validacao } from '@pz/kernel';
import { z } from 'zod';

import type { FerramentaIA } from '@pz/integracoes';
import type { ErroDominio, Result, Uuid } from '@pz/kernel';

/**
 * Quem pede a ferramenta: sempre a identidade autenticada (sessão, OAuth ou MCP), nunca o modelo.
 * O tenant sai daqui e é aplicado no código; nenhuma ferramenta o recebe como argumento (ADR-016).
 */
export interface ContextoDaFerramenta {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly permissoes: ReadonlySet<string>;
  readonly canal: 'portal' | 'app' | 'mcp' | 'integrador';
}

/**
 * Uma capacidade que a IA pode usar (HU59). Entrada e saída por schema Zod; a permissão é a mesma
 * do endpoint equivalente. O catálogo inicial só tem leitura: `alteraEstado` é sempre `false` e,
 * quando houver escrita, ela exigirá confirmação humana no cliente (ADR-016).
 */
export interface Ferramenta<Entrada, Saida> {
  /** snake_case, estável: é o nome que o modelo usa. */
  readonly nome: string;
  /** Para o modelo: o que faz e quando usar. */
  readonly descricao: string;
  readonly permissao: string;
  readonly alteraEstado: false;
  readonly entrada: z.ZodType<Entrada>;
  readonly saida: z.ZodType<Saida>;
  executar(entrada: Entrada, contexto: ContextoDaFerramenta): Promise<Result<Saida, ErroDominio>>;
}

/** O que vai para a trilha de auditoria em toda chamada (permitida ou não). */
export interface ExecucaoDeFerramenta {
  readonly nome: string;
  readonly argumentos: unknown;
  readonly resultado: 'ok' | 'proibida' | 'entrada-invalida' | 'erro';
  readonly codigoDoErro?: string;
}

export type AuditarFerramenta = (
  contexto: ContextoDaFerramenta,
  execucao: ExecucaoDeFerramenta,
) => Promise<void>;

const NOME = /^[a-z][a-z0-9_]{2,63}$/;
const CAMPOS_DE_TENANT = new Set(['tenant', 'tenantid', 'tenant_id']);

// Tipo apagado só no registro: cada ferramenta é validada pelos próprios schemas na execução.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registro heterogêneo; a entrada é validada pelo schema da própria ferramenta antes de executar.
type QualquerFerramenta = Ferramenta<any, any>;

function semCampoDeTenant(nome: string, esquema: Record<string, unknown>): void {
  const propriedades = esquema.properties;
  if (typeof propriedades !== 'object' || propriedades === null) return;
  for (const campo of Object.keys(propriedades)) {
    if (CAMPOS_DE_TENANT.has(campo.toLowerCase())) {
      throw new Error(`Ferramenta ${nome}: o tenant nunca é argumento (vem da identidade).`);
    }
  }
}

/**
 * Catálogo único das ferramentas de IA (HU59, ADR-016): o mesmo para o assistente interno, o
 * servidor MCP e a API pública. Na execução: confere a permissão, valida a entrada, executa com o
 * contexto autenticado, valida a saída e audita. Erro de validação ou de permissão volta como
 * resultado (o modelo pode corrigir); saída fora do schema é defeito e lança.
 */
export class CatalogoDeFerramentas {
  readonly #ferramentas = new Map<string, QualquerFerramenta>();
  readonly #esquemas = new Map<string, Record<string, unknown>>();

  constructor(
    ferramentas: readonly QualquerFerramenta[],
    private readonly auditar: AuditarFerramenta,
  ) {
    for (const f of ferramentas) {
      if (!NOME.test(f.nome)) throw new Error(`Nome de ferramenta inválido: ${f.nome}`);
      if (this.#ferramentas.has(f.nome)) throw new Error(`Ferramenta repetida: ${f.nome}`);
      // Defesa em profundidade: o tipo já impede, mas um `as` não passa daqui.
      if (f.alteraEstado as boolean) {
        throw new Error(
          `Ferramenta ${f.nome} altera estado: exige confirmação humana (fora do catálogo).`,
        );
      }
      const esquema = z.toJSONSchema(f.entrada, { io: 'input' }) as Record<string, unknown>;
      semCampoDeTenant(f.nome, esquema);
      this.#ferramentas.set(f.nome, f);
      this.#esquemas.set(f.nome, esquema);
    }
  }

  /** Ferramentas que o contexto pode usar, no formato da porta ProvedorIA. */
  disponiveis(contexto: Pick<ContextoDaFerramenta, 'permissoes'>): FerramentaIA[] {
    return [...this.#ferramentas.values()]
      .filter((f) => contexto.permissoes.has(f.permissao))
      .map((f) => ({
        nome: f.nome,
        descricao: f.descricao,
        entrada: this.#esquemas.get(f.nome) ?? {},
      }));
  }

  /**
   * Confere, sem executar, se a ferramenta existe para o contexto e se os argumentos seguem o
   * schema dela (a escolha feita pelo modelo, HU59). Devolve a entrada já normalizada.
   */
  validarEntrada(
    nome: string,
    argumentos: unknown,
    contexto: Pick<ContextoDaFerramenta, 'permissoes'>,
  ): Result<unknown, ErroDominio> {
    const ferramenta = this.#ferramentas.get(nome);
    if (ferramenta === undefined || !contexto.permissoes.has(ferramenta.permissao)) {
      return err(
        new NaoEncontrado('ferramenta-indisponivel', `Ferramenta ${nome} não disponível aqui.`),
      );
    }
    const entrada = ferramenta.entrada.safeParse(argumentos);
    return entrada.success
      ? ok(entrada.data)
      : err(
          new Validacao(
            entrada.error.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })),
          ),
        );
  }

  async executar(
    nome: string,
    argumentos: unknown,
    contexto: ContextoDaFerramenta,
  ): Promise<Result<unknown, ErroDominio>> {
    const ferramenta = this.#ferramentas.get(nome);
    if (ferramenta === undefined) {
      return err(new NaoEncontrado('ferramenta-inexistente', `Ferramenta ${nome} não existe.`));
    }
    if (!contexto.permissoes.has(ferramenta.permissao)) {
      await this.auditar(contexto, { nome, argumentos, resultado: 'proibida' });
      return err(new Proibido('sem-permissao', `Sem permissão para ${nome}.`));
    }
    const entrada = ferramenta.entrada.safeParse(argumentos);
    if (!entrada.success) {
      await this.auditar(contexto, { nome, argumentos, resultado: 'entrada-invalida' });
      return err(
        new Validacao(
          entrada.error.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })),
        ),
      );
    }
    const resultado = await ferramenta.executar(entrada.data, contexto);
    if (!resultado.ok) {
      await this.auditar(contexto, {
        nome,
        argumentos: entrada.data,
        resultado: 'erro',
        codigoDoErro: resultado.erro.codigo,
      });
      return resultado;
    }
    const saida = ferramenta.saida.safeParse(resultado.valor);
    if (!saida.success) throw new Error(`Ferramenta ${nome} devolveu saída fora do schema.`);
    await this.auditar(contexto, { nome, argumentos: entrada.data, resultado: 'ok' });
    return ok(saida.data);
  }
}
