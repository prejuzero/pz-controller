import type { Transacao } from '@pz/db';

type Valor = string | number | boolean | null | readonly string[];
interface Secao {
  readonly nome: string;
  readonly linhas: readonly Readonly<Record<string, Valor>>[];
}
const iso = (data: Date | null) => data?.toISOString() ?? null;

/** Dados do cadastro para a exportação (HU38, LGPD): advogado, OABs, clientes e processos. */
export class ExportacaoDoCadastroPostgres {
  async titular(tx: Transacao, usuarioId: string): Promise<Secao[]> {
    const advogados = await tx.advogado.findMany({ where: { usuarioId }, include: { oabs: true } });
    return [
      {
        nome: 'advogado',
        linhas: advogados.map((a) => ({
          id: a.id,
          nome: a.nome,
          cpf: a.cpf,
          celular: a.celular,
          emailsAdicionais: a.emailsAdicionais,
          criadoEm: iso(a.criadoEm),
        })),
      },
      {
        nome: 'oabs',
        linhas: advogados.flatMap((a) =>
          a.oabs.map((o) => ({
            numero: o.numero,
            uf: o.uf,
            tipo: o.tipo,
            ativa: o.ativa,
            removidaEm: iso(o.removidaEm),
          })),
        ),
      },
    ];
  }

  async escritorio(tx: Transacao): Promise<Secao[]> {
    const [advogados, oabs, clientes, processos] = await Promise.all([
      tx.advogado.findMany({ orderBy: { criadoEm: 'asc' } }),
      tx.oab.findMany({ orderBy: { criadoEm: 'asc' } }),
      tx.cliente.findMany({ orderBy: { criadoEm: 'asc' } }),
      tx.processo.findMany({ orderBy: { criadoEm: 'asc' } }),
    ]);
    return [
      {
        nome: 'advogados',
        linhas: advogados.map((a) => ({
          id: a.id,
          usuarioId: a.usuarioId,
          nome: a.nome,
          cpf: a.cpf,
          celular: a.celular,
        })),
      },
      {
        nome: 'oabs',
        linhas: oabs.map((o) => ({
          advogadoId: o.advogadoId,
          numero: o.numero,
          uf: o.uf,
          tipo: o.tipo,
          ativa: o.ativa,
        })),
      },
      {
        nome: 'clientes',
        linhas: clientes.map((c) => ({
          id: c.id,
          nome: c.nome,
          documento: c.documento,
          criadoEm: iso(c.criadoEm),
        })),
      },
      {
        nome: 'processos',
        linhas: processos.map((p) => ({
          id: p.id,
          numeroCnj: p.numeroCnj,
          tribunal: p.tribunal,
          ramo: p.ramo,
          orgao: p.orgao,
          comarca: p.comarca,
          sigiloso: p.sigiloso,
          cobertura: p.cobertura,
          motivoCobertura: p.motivoCobertura,
          clienteId: p.clienteId,
          criadoEm: iso(p.criadoEm),
        })),
      },
    ];
  }
}
