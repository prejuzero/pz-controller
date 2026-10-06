import { FUSO_PADRAO, LocalDate } from '@pz/kernel';

import { HASH_GENESE, verificarCadeia } from '../domain/cadeia.js';
import { jsonCanonico } from '../domain/canonico.js';

import type { RegistroEncadeado, Sha256 } from '../domain/cadeia.js';
import type { Clock, UnidadeDeTrabalho } from '@pz/kernel';

export interface Checkpoint {
  readonly ultimaSequencia: number;
  readonly ultimoHash: string;
  readonly ultimaExportada: number;
}

/** Leitura da cadeia de qualquer tenant (o verificador roda como sistema, com filtro explícito). */
export interface RepositorioDaCadeia<Transacao> {
  tenants(tx: Transacao): Promise<string[]>;
  ler(
    tx: Transacao,
    tenantId: string,
    desdeSequencia: number,
    limite: number,
  ): Promise<RegistroEncadeado[]>;
  ultimaSequencia(tx: Transacao, tenantId: string): Promise<number>;
  checkpoint(tx: Transacao, tenantId: string): Promise<Checkpoint | undefined>;
  salvar(tx: Transacao, tenantId: string, checkpoint: Checkpoint): Promise<void>;
}

/** Armazenamento WORM (object lock): o que é gravado não se altera nem se apaga no prazo. */
export interface DestinoWorm {
  gravar(tenantId: string, caminho: string, conteudo: Uint8Array): Promise<void>;
}

export type ResultadoDoTenant =
  | { readonly tenantId: string; readonly situacao: 'integra'; readonly exportados: number }
  | {
      readonly tenantId: string;
      readonly situacao: 'divergente';
      readonly sequencia: number;
      readonly motivo: string;
    };

const LOTE = 1_000;

/**
 * Verificador diário (HU08, PZ-110): confere a cadeia de cada tenant a partir do último elo
 * conferido (incremental) e exporta os registros novos em NDJSON canônico para o WORM. O
 * checkpoint é a âncora: cadeia mais curta que ele significa registros apagados do fim. Com
 * divergência, nada é exportado nem avança (o alerta fica com quem chama).
 */
export class VerificarIntegridade<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly cadeia: RepositorioDaCadeia<Transacao>,
    private readonly worm: DestinoWorm,
    private readonly sha256: Sha256,
    private readonly relogio: Clock,
  ) {}

  async executar(): Promise<ResultadoDoTenant[]> {
    const tenants = await this.unidade.executar((tx) => this.cadeia.tenants(tx));
    const resultados: ResultadoDoTenant[] = [];
    for (const tenantId of tenants) {
      resultados.push(await this.unidade.executar((tx) => this.#tenant(tx, tenantId)));
    }
    return resultados;
  }

  async #tenant(tx: Transacao, tenantId: string): Promise<ResultadoDoTenant> {
    const anterior = (await this.cadeia.checkpoint(tx, tenantId)) ?? {
      ultimaSequencia: 0,
      ultimoHash: HASH_GENESE,
      ultimaExportada: 0,
    };
    const ultima = await this.cadeia.ultimaSequencia(tx, tenantId);
    if (ultima < anterior.ultimaSequencia) {
      return {
        tenantId,
        situacao: 'divergente',
        sequencia: ultima + 1,
        motivo: `registros removidos do fim da cadeia (âncora na sequência ${String(anterior.ultimaSequencia)})`,
      };
    }
    let elo = { sequencia: anterior.ultimaSequencia, hash: anterior.ultimoHash };
    let exportados = 0;
    for (;;) {
      const lote = await this.cadeia.ler(tx, tenantId, elo.sequencia, LOTE);
      if (lote.length === 0) break;
      const verificacao = verificarCadeia(lote, this.sha256, elo);
      if (!verificacao.valida) {
        return {
          tenantId,
          situacao: 'divergente',
          sequencia: verificacao.sequencia,
          motivo: verificacao.motivo,
        };
      }
      const novos = lote.filter((r) => r.sequencia > anterior.ultimaExportada);
      if (novos.length > 0) {
        await this.worm.gravar(tenantId, this.#caminho(novos), this.#ndjson(novos));
        exportados += novos.length;
      }
      elo = verificacao.ultimo ?? elo;
    }
    await this.cadeia.salvar(tx, tenantId, {
      ultimaSequencia: elo.sequencia,
      ultimoHash: elo.hash,
      ultimaExportada: elo.sequencia,
    });
    return { tenantId, situacao: 'integra', exportados };
  }

  #caminho(registros: readonly RegistroEncadeado[]): string {
    const dia = LocalDate.doInstante(this.relogio.agora(), FUSO_PADRAO)
      .paraIso()
      .replace(/-/g, '/');
    const [primeiro, ultimo] = [registros[0]?.sequencia, registros.at(-1)?.sequencia];
    return `auditoria/${dia}/${String(primeiro)}-${String(ultimo)}.ndjson`;
  }

  #ndjson(registros: readonly RegistroEncadeado[]): Uint8Array {
    return new TextEncoder().encode(`${registros.map((r) => jsonCanonico(r)).join('\n')}\n`);
  }
}

/**
 * Trecho verificável de uma entidade (base do PDF verificável, HU35): os registros dela e se a
 * cadeia inteira do tenant, da gênese até o fim, confere.
 */
export class ConsultarTrecho<Transacao> {
  constructor(
    private readonly cadeia: RepositorioDaCadeia<Transacao>,
    private readonly sha256: Sha256,
  ) {}

  async executar(
    tx: Transacao,
    tenantId: string,
    entidade: string,
    entidadeId: string,
  ): Promise<{ readonly registros: RegistroEncadeado[]; readonly cadeiaIntegra: boolean }> {
    const todos: RegistroEncadeado[] = [];
    for (;;) {
      const lote = await this.cadeia.ler(tx, tenantId, todos.at(-1)?.sequencia ?? 0, LOTE);
      if (lote.length === 0) break;
      todos.push(...lote);
    }
    return {
      registros: todos.filter((r) => r.entidade === entidade && r.entidadeId === entidadeId),
      cadeiaIntegra: verificarCadeia(todos, this.sha256).valida,
    };
  }
}
