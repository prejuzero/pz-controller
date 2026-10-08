import type { RepositorioDeRegras } from '../application/classificar.js';
import type { RegraRapida } from '../domain/regras.js';
import type { TransacaoEmMemoria } from '@pz/kernel';

/** Regras em memória, com a mesma semântica de "vigente" do Postgres. Só para testes. */
export class RegrasEmMemoria implements RepositorioDeRegras<TransacaoEmMemoria> {
  constructor(readonly regras: (RegraRapida & { readonly ativa?: boolean })[] = []) {}

  vigentes(): Promise<RegraRapida[]> {
    const ultima = new Map<string, RegraRapida & { readonly ativa?: boolean }>();
    for (const r of this.regras) {
      if ((ultima.get(r.codigo)?.versao ?? 0) < r.versao) ultima.set(r.codigo, r);
    }
    return Promise.resolve(
      [...ultima.values()]
        .filter((r) => r.ativa !== false)
        .map(({ codigo, versao, tipoAto, padroes, confianca }) => ({
          codigo,
          versao,
          tipoAto,
          padroes,
          confianca,
        })),
    );
  }
}
