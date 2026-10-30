import type { RepositorioDeRegras } from '../application/classificar.js';
import type {
  CasoCandidato,
  ClassificacaoOriginal,
  RepositorioDeCandidatos,
  StatusDoCandidato,
} from '../application/curadoria.js';
import type { RegraRapida } from '../domain/regras.js';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

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

/** Casos candidatos em memória, com a mesma unicidade da correção. Só para testes. */
export class CandidatosEmMemoria implements RepositorioDeCandidatos<unknown> {
  readonly casos = new Map<string, CasoCandidato>();
  readonly classificacoes = new Map<string, ClassificacaoOriginal>();

  classificacao(_tx: unknown, conteudoId: Uuid) {
    return Promise.resolve(this.classificacoes.get(conteudoId));
  }

  inserir(_tx: unknown, c: CasoCandidato): Promise<boolean> {
    const repetido = [...this.casos.values()].some(
      (x) =>
        x.conteudoId === c.conteudoId &&
        x.tipoAtoCorrigido === c.tipoAtoCorrigido &&
        x.diasCorrigidos === c.diasCorrigidos,
    );
    if (repetido) return Promise.resolve(false);
    this.casos.set(c.id, c);
    return Promise.resolve(true);
  }

  buscar(_tx: unknown, id: Uuid) {
    return Promise.resolve(this.casos.get(id));
  }

  decidir(_tx: unknown, c: CasoCandidato): Promise<boolean> {
    if (this.casos.get(c.id)?.status !== 'pendente') return Promise.resolve(false);
    this.casos.set(c.id, c);
    return Promise.resolve(true);
  }

  listar(
    _tx: unknown,
    filtro: { readonly status?: StatusDoCandidato; readonly apos?: Uuid; readonly limite: number },
  ) {
    return Promise.resolve(
      [...this.casos.values()]
        .filter(
          (c) =>
            (filtro.status === undefined || c.status === filtro.status) &&
            (filtro.apos === undefined || c.id > filtro.apos),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, filtro.limite),
    );
  }
}
