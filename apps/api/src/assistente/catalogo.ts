import { ferramentasDoAssistente } from '@pz/assistente';
import { CatalogoDeFerramentas } from '@pz/ia';
import { ok } from '@pz/kernel';

import type { FontesDasFerramentas } from '@pz/assistente';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Buscar } from '@pz/busca';
import type { ConsultarProcesso } from '@pz/cadastro';
import type { AuditarFerramenta } from '@pz/ia';
import type { Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';
import type { CadastrarPrazoManual, ConsultarPrazo } from '@pz/prazos';

/**
 * A saída como o cliente HTTP a recebe (ida e volta pelo JSON): os casos de uso devolvem `Date`,
 * `LocalDate` e afins, que o JSON vira string. Assim a ferramenta entrega ao modelo o mesmo que o
 * endpoint, e o catálogo valida pelo schema do contrato da API.
 */
export function comoNoHttp<V, E>(r: Result<V, E>): Result<unknown, E> {
  return r.ok ? ok(JSON.parse(JSON.stringify(r.valor)) as unknown) : r;
}

export interface DependenciasDoCatalogo {
  readonly buscar: Buscar;
  readonly consultarProcesso: ConsultarProcesso<unknown>;
  readonly cadastrarPrazo: CadastrarPrazoManual<unknown>;
  readonly consultarPrazo: ConsultarPrazo<unknown>;
  readonly unidade: UnidadeDeTrabalho<unknown>;
  readonly trilha: TrilhaDeAuditoria<unknown>;
  /** Roda o trabalho no tenant informado (RLS). */
  readonly noTenant: <T>(tenantId: Uuid, trabalho: () => Promise<T>) => Promise<T>;
}

/**
 * Catálogo de ferramentas de IA (HU59, ADR-016) composto pelas APIs públicas dos módulos. Sem
 * regra aqui: cada fonte só chama o caso de uso no tenant do contexto (da identidade autenticada,
 * nunca do modelo), e a auditoria registra cada chamada na trilha desse tenant.
 */
export function catalogoDeFerramentas(d: DependenciasDoCatalogo): CatalogoDeFerramentas {
  const comoContrato = (r: Result<unknown, unknown>): never => comoNoHttp(r) as never;
  const fontes: FontesDasFerramentas = {
    buscarPrazos: (filtros, c) =>
      d.noTenant(c.tenantId, async () => comoContrato(await d.buscar.prazos(filtros))),
    buscarPublicacoes: (filtros, c) =>
      d.noTenant(c.tenantId, async () => comoContrato(await d.buscar.publicacoes(filtros))),
    consultarProcesso: (id, c) =>
      d.noTenant(c.tenantId, async () =>
        comoContrato(await d.consultarProcesso.executar(id as Uuid)),
      ),
    simularPrazo: (pedido, c) =>
      d.noTenant(c.tenantId, async () =>
        comoContrato(
          await d.cadastrarPrazo.simular(
            { tenantId: c.tenantId, usuarioId: c.usuarioId, canal: c.canal },
            { ...pedido, origem: 'manual' },
          ),
        ),
      ),
    consultarPrazo: (id, c) =>
      d.noTenant(c.tenantId, async () => comoContrato(await d.consultarPrazo.executar(id as Uuid))),
  };
  const auditar: AuditarFerramenta = (c, execucao) =>
    d.noTenant(c.tenantId, () =>
      d.unidade.executar((tx) =>
        d.trilha.registrar(
          tx,
          {
            tipo: 'ia.ferramenta-executada',
            entidade: 'ferramenta-ia',
            entidadeId: execucao.nome,
            depois: {
              argumentos: execucao.argumentos,
              resultado: execucao.resultado,
              ...(execucao.codigoDoErro === undefined
                ? {}
                : { codigoDoErro: execucao.codigoDoErro }),
            },
          },
          { canal: c.canal, usuarioId: c.usuarioId },
        ),
      ),
    );
  return new CatalogoDeFerramentas(ferramentasDoAssistente(fontes), auditar);
}
