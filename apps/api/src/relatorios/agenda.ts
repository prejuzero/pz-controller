import { LocalDate } from '@pz/kernel';

import type { Buscar } from '@pz/busca';
import type { ConsultarProcesso } from '@pz/cadastro';
import type { Uuid } from '@pz/kernel';
import type { ConsultarTabelaDePrazos } from '@pz/prazos';
import type { FonteDaAgenda, PrazoDaAgenda } from '@pz/relatorios';

/** Até 1.000 prazos abertos no feed (10 páginas da busca): mais que isso pede filtro no portal. */
const PAGINAS = 10;
const POR_PAGINA = 100;

export interface DependenciasDaAgenda {
  readonly buscar: Buscar;
  readonly consultarProcesso: ConsultarProcesso<unknown>;
  readonly tabela: ConsultarTabelaDePrazos<unknown>;
  /** Roda no tenant do usuário (o feed chega sem sessão). */
  readonly noTenant: <T>(tenantId: Uuid, trabalho: () => Promise<T>) => Promise<T>;
}

/**
 * Prazos da agenda (HU50) pelas APIs públicas: a busca da HU28 (abertos), o cadastro (número e
 * sigilo do processo) e a taxonomia (nome do ato). Só os do usuário e os sem responsável. Sem
 * regra aqui; o vencimento é o do motor, como a busca o devolve.
 */
export function fonteDaAgenda(d: DependenciasDaAgenda): FonteDaAgenda {
  return {
    prazosAbertos: (usuario) =>
      d.noTenant(usuario.tenantId, async () => {
        const nomes = new Map((await d.tabela.tiposDeAto()).map((t) => [t.codigo, t.nome]));
        const processos = new Map<string, { numeroCnj: string; sigiloso: boolean } | null>();
        const prazos: PrazoDaAgenda[] = [];
        let cursor: string | undefined;
        for (let pagina = 0; pagina < PAGINAS; pagina++) {
          const r = await d.buscar.prazos({
            statusPrazo: ['pendente', 'a-confirmar'],
            limite: POR_PAGINA,
            ...(cursor === undefined ? {} : { cursor }),
          });
          if (!r.ok) throw r.erro;
          for (const p of r.valor.itens) {
            if (p.responsavelId !== null && p.responsavelId !== usuario.usuarioId) continue;
            if (p.vencimento === null) continue;
            if (p.status !== 'pendente' && p.status !== 'a-confirmar') continue;
            const vencimento = LocalDate.analisar(p.vencimento);
            if (!vencimento.ok) continue;
            if (!processos.has(p.processoId)) {
              const proc = await d.consultarProcesso.executar(p.processoId);
              processos.set(
                p.processoId,
                proc.ok ? { numeroCnj: proc.valor.numeroCnj, sigiloso: proc.valor.sigiloso } : null,
              );
            }
            const processo = processos.get(p.processoId);
            if (processo === undefined || processo === null) continue;
            prazos.push({
              id: p.id,
              vencimento: vencimento.valor,
              status: p.status,
              nomeDoAto: nomes.get(p.tipoAto) ?? p.tipoAto,
              ...processo,
            });
          }
          if (r.valor.proximoCursor === null) break;
          cursor = r.valor.proximoCursor;
        }
        return prazos;
      }),
  };
}
