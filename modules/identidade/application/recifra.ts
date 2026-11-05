import type { Cifra } from './portas.js';
import type { UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Segredo do 2FA gravado (pendente ou ativo), sempre cifrado. */
export interface SegredoParaRecifrar {
  readonly usuarioId: Uuid;
  readonly cifrado: string;
}

/** Porta: os segredos do 2FA no tenant da transação (RLS); a lista de tenants vem como sistema. */
export interface SegredosParaRecifrar<Transacao> {
  tenants(transacao: Transacao): Promise<Uuid[]>;
  lote(transacao: Transacao, depoisDe: Uuid | null, limite: number): Promise<SegredoParaRecifrar[]>;
  /** Troca só se o segredo ainda for o lido: um 2FA reconfigurado no meio não é sobrescrito. */
  trocar(transacao: Transacao, usuarioId: Uuid, antigo: string, novo: string): Promise<boolean>;
}

/** Cifra que sabe se o dado foi cifrado com uma chave que não é mais a ativa (ADR-021). */
export interface CifraComRotacao extends Cifra {
  precisaRecifrar(cifrado: string): boolean;
}

const LOTE = 200;

/**
 * Recifra os segredos do 2FA com a chave de dados ativa (HU37, PZ-359; ADR-021): sem isso, a
 * rotação só alcançava quem reconfigurava o 2FA, e a chave antiga não podia sair da lista.
 * Idempotente (o que já está na chave ativa não muda), por tenant (RLS) e em lotes. O segredo
 * nunca sai daqui nem vai para log.
 */
export class RecifrarSegredosDoSegundoFator<Transacao> {
  constructor(
    private readonly sistema: UnidadeDeTrabalho<Transacao>,
    private readonly noTenant: <T>(tenantId: Uuid, trabalho: () => Promise<T>) => Promise<T>,
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly segredos: SegredosParaRecifrar<Transacao>,
    private readonly cifra: CifraComRotacao,
  ) {}

  async executar(): Promise<{ escritorios: number; recifrados: number }> {
    const tenants = await this.sistema.executar((tx) => this.segredos.tenants(tx));
    let recifrados = 0;
    for (const tenantId of tenants) {
      let depoisDe: Uuid | null = null;
      for (;;) {
        const cursor: Uuid | null = depoisDe;
        const lote = await this.noTenant(tenantId, () =>
          this.unidade.executar(async (tx) => {
            const linhas = await this.segredos.lote(tx, cursor, LOTE);
            for (const { usuarioId, cifrado } of linhas) {
              if (!this.cifra.precisaRecifrar(cifrado)) continue;
              const novo = this.cifra.cifrar(this.cifra.decifrar(cifrado));
              if (await this.segredos.trocar(tx, usuarioId, cifrado, novo)) recifrados += 1;
            }
            return linhas;
          }),
        );
        if (lote.length < LOTE) break;
        depoisDe = lote.at(-1)?.usuarioId ?? null;
      }
    }
    return { escritorios: tenants.length, recifrados };
  }
}
