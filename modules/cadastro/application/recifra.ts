import type { ProtecaoDeCampos } from './portas.js';
import type { UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Campo sensível cifrado, candidato a recifra quando a chave dele não é mais a ativa. */
export interface CampoParaRecifrar {
  readonly tabela: 'advogado' | 'cliente';
  readonly id: Uuid;
  readonly cifrado: string;
}

/** Porta: as linhas e a gravação (no tenant da transação, RLS); só inserção não se aplica aqui. */
export interface CamposSensiveis<Transacao> {
  /** Tenants com algum campo cifrado (papel sistema): a recifra decide o que muda. */
  tenants(transacao: Transacao): Promise<Uuid[]>;
  lote(transacao: Transacao, depoisDe: Uuid | null, limite: number): Promise<CampoParaRecifrar[]>;
  gravar(
    transacao: Transacao,
    campo: CampoParaRecifrar,
    novo: { cifrado: string; indice: string | null },
  ): Promise<void>;
}

const LOTE = 200;

/**
 * Recifra com a chave ativa os campos cifrados com chave antiga (HU37, PZ-219; ADR-021). Desde a
 * fase contract não há mais campo em claro. Idempotente: o que já está com a chave ativa não muda. Roda por tenant (RLS),
 * em lotes; a rotação de chaves é: pôr a nova chave na frente da lista e rodar este job.
 */
export class RecifrarCamposSensiveis<Transacao> {
  constructor(
    private readonly sistema: UnidadeDeTrabalho<Transacao>,
    private readonly noTenant: <T>(tenantId: Uuid, trabalho: () => Promise<T>) => Promise<T>,
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly campos: CamposSensiveis<Transacao>,
    private readonly protecao: ProtecaoDeCampos,
  ) {}

  async executar(): Promise<{ escritorios: number; atualizados: number }> {
    const tenants = await this.sistema.executar((tx) => this.campos.tenants(tx));
    let atualizados = 0;
    for (const tenantId of tenants) {
      let depoisDe: Uuid | null = null;
      for (;;) {
        const cursor: Uuid | null = depoisDe;
        const lote = await this.noTenant(tenantId, () =>
          this.unidade.executar(async (tx) => {
            const linhas = await this.campos.lote(tx, cursor, LOTE);
            for (const campo of linhas) {
              const novo = this.#novo(campo);
              if (novo === undefined) continue;
              await this.campos.gravar(tx, campo, novo);
              atualizados += 1;
            }
            return linhas;
          }),
        );
        if (lote.length < LOTE) break;
        depoisDe = lote.at(-1)?.id ?? null;
      }
    }
    return { escritorios: tenants.length, atualizados };
  }

  #novo(c: CampoParaRecifrar): { cifrado: string; indice: string | null } | undefined {
    if (!this.protecao.precisaRecifrar(c.cifrado)) return undefined;
    const texto = this.protecao.decifrar(c.cifrado);
    return {
      cifrado: this.protecao.cifrar(texto),
      indice: c.tabela === 'advogado' ? this.protecao.indice(texto) : null,
    };
  }
}
