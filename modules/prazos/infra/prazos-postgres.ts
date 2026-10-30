import { Instant, LocalDate } from '@pz/kernel';

import { Prazo } from '../domain/prazo.js';

import type { AlcanceDaAlteracao, RepositorioDePrazos } from '../application/portas.js';
import type { CalculoDoPrazo, JurisdicaoDoPrazo, Json } from '../domain/prazo.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

// Colunas DATE chegam como meia-noite UTC: a data jurídica é lida e gravada em UTC, sem fuso.
const paraData = (data: LocalDate) => new Date(Date.UTC(data.ano, data.mes - 1, data.dia));
const daData = (data: Date) =>
  LocalDate.de(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate());

// Enums do banco em snake_case; no domínio, kebab-case.
type Snake<T extends string> = T extends `${infer A}-${infer B}` ? `${A}_${Snake<B>}` : T;
type Kebab<T extends string> = T extends `${infer A}_${infer B}` ? `${A}-${Kebab<B>}` : T;
const paraBanco = <T extends string>(valor: T) => valor.replaceAll('-', '_') as Snake<T>;
const doBanco = <T extends string>(valor: T) => valor.replaceAll('_', '-') as Kebab<T>;

/** Objeto do domínio para o tipo JSON do Prisma (que exige assinatura de índice). */
const paraJson = (valor: unknown) => JSON.parse(JSON.stringify(valor)) as object;

type Linha = Awaited<ReturnType<Transacao['prazo']['findFirstOrThrow']>>;

function restaurar(linha: Linha): Prazo {
  const memoria = linha.memoriaCalculo as Json;
  const situacao =
    memoria !== null && typeof memoria === 'object' && !Array.isArray(memoria)
      ? (memoria as { situacao?: Json }).situacao
      : undefined;
  const calculo: CalculoDoPrazo = {
    situacao: situacao === 'calculado' ? 'calculado' : 'a-confirmar',
    dias: linha.dias,
    unidade: linha.unidade,
    inicio: linha.inicio === null ? null : daData(linha.inicio),
    vencimento: linha.vencimento === null ? null : daData(linha.vencimento),
    fimDoPrazo: linha.fimDoPrazo === null ? null : Instant.deEpochMs(linha.fimDoPrazo.getTime()),
    fusoDoJuizo: linha.fusoDoJuizo,
    fundamento: linha.fundamento,
    versaoMotor: linha.versaoMotor ?? '',
    versaoTabela: linha.versaoTabela,
    memoria,
  };
  return Prazo.restaurar({
    id: linha.id as Uuid,
    tenantId: linha.tenantId as Uuid,
    processoId: linha.processoId as Uuid,
    publicacaoConteudoId: linha.publicacaoConteudoId as Uuid | null,
    tipoAto: linha.tipoAto,
    ramo: linha.ramo === null ? null : doBanco(linha.ramo),
    calculo,
    vencimentoManual: linha.vencimentoManual,
    entrada: (linha.entradaCalculo ?? null) as Json,
    origem: linha.origem,
    status: doBanco(linha.status),
    statusCiencia: linha.statusCiencia,
    responsavelId: linha.responsavelId as Uuid | null,
    jurisdicao: linha.jurisdicao as unknown as JurisdicaoDoPrazo,
    versaoOtimista: linha.versaoOtimista,
  });
}

function colunasDoCalculo(calculo: CalculoDoPrazo) {
  return {
    dias: calculo.dias,
    unidade: calculo.unidade,
    inicio: calculo.inicio === null ? null : paraData(calculo.inicio),
    vencimento: calculo.vencimento === null ? null : paraData(calculo.vencimento),
    fimDoPrazo: calculo.fimDoPrazo === null ? null : new Date(calculo.fimDoPrazo.epochMs),
    fusoDoJuizo: calculo.fusoDoJuizo,
    fundamento: calculo.fundamento,
    versaoMotor: calculo.versaoMotor,
    versaoTabela: calculo.versaoTabela,
    // Json do domínio é serializável por construção (JSON.parse do motor).
    memoriaCalculo: calculo.memoria as object,
  };
}

/** Prazos abertos e calculados pelo motor que a alteração alcança (só leitura de ids). */
function filtroDoAlcance(alcance: AlcanceDaAlteracao) {
  const inicio = alcance.inicio.paraIso();
  const fim = alcance.fim.paraIso();
  return {
    inicio,
    fim,
    uf: alcance.uf ?? null,
    tribunal: alcance.tribunal ?? null,
    comarca: alcance.comarca ?? null,
    abrangencia: alcance.abrangencia,
  };
}

/** Prazos do tenant da transação (RLS). Sem DELETE: cancelamento é estado. */
export class PrazosPostgres implements RepositorioDePrazos<Transacao> {
  async inserir(transacao: Transacao, prazo: Prazo): Promise<void> {
    const e = prazo.estado;
    await transacao.prazo.create({
      data: {
        id: e.id,
        tenantId: e.tenantId,
        processoId: e.processoId,
        publicacaoConteudoId: e.publicacaoConteudoId,
        tipoAto: e.tipoAto,
        ramo: e.ramo === null ? null : paraBanco(e.ramo),
        ...colunasDoCalculo(e.calculo),
        vencimentoManual: e.vencimentoManual,
        ...(e.entrada === null ? {} : { entradaCalculo: e.entrada as object }),
        origem: e.origem,
        status: paraBanco(e.status),
        statusCiencia: e.statusCiencia,
        responsavelId: e.responsavelId,
        jurisdicao: paraJson(e.jurisdicao),
        versaoOtimista: e.versaoOtimista,
      },
    });
  }

  async buscar(transacao: Transacao, id: Uuid): Promise<Prazo | undefined> {
    const linha = await transacao.prazo.findUnique({ where: { id } });
    return linha === null ? undefined : restaurar(linha);
  }

  async atualizar(transacao: Transacao, prazo: Prazo, versaoLida: number): Promise<boolean> {
    const e = prazo.estado;
    const { count } = await transacao.prazo.updateMany({
      where: { id: e.id, versaoOtimista: versaoLida },
      data: {
        ...colunasDoCalculo(e.calculo),
        status: paraBanco(e.status),
        versaoOtimista: e.versaoOtimista,
      },
    });
    return count === 1;
  }

  async afetados(
    transacao: Transacao,
    alcance: AlcanceDaAlteracao,
    depoisDe: Uuid | null,
    limite: number,
  ): Promise<Prazo[]> {
    const f = filtroDoAlcance(alcance);
    const ids = await transacao.$queryRaw<{ id: string }[]>`
      SELECT id FROM prazo
       WHERE status IN ('a_confirmar', 'pendente')
         AND NOT vencimento_manual
         AND entrada_calculo IS NOT NULL
         AND (entrada_calculo->>'dataDeReferencia')::date <= ${f.fim}::date
         AND (vencimento IS NULL OR vencimento >= ${f.inicio}::date)
         AND (${f.abrangencia} = 'nacional'
              OR (${f.abrangencia} = 'uf' AND jurisdicao->>'uf' = ${f.uf})
              OR (${f.abrangencia} = 'tribunal' AND jurisdicao->>'tribunal' = ${f.tribunal})
              OR (${f.abrangencia} = 'comarca' AND jurisdicao->>'tribunal' = ${f.tribunal}
                  AND jurisdicao->>'comarca' = ${f.comarca}))
         AND (${depoisDe}::uuid IS NULL OR id > ${depoisDe}::uuid)
       ORDER BY id
       LIMIT ${limite}`;
    if (ids.length === 0) return [];
    const linhas = await transacao.prazo.findMany({
      where: { id: { in: ids.map((l) => l.id) } },
      orderBy: { id: 'asc' },
    });
    return linhas.map(restaurar);
  }

  async tenantsAfetados(transacao: Transacao, alcance: AlcanceDaAlteracao): Promise<Uuid[]> {
    const f = filtroDoAlcance(alcance);
    const linhas = await transacao.$queryRaw<{ tenant_id: string }[]>`
      SELECT DISTINCT tenant_id FROM prazo
       WHERE status IN ('a_confirmar', 'pendente')
         AND NOT vencimento_manual
         AND entrada_calculo IS NOT NULL
         AND (entrada_calculo->>'dataDeReferencia')::date <= ${f.fim}::date
         AND (vencimento IS NULL OR vencimento >= ${f.inicio}::date)
         AND (${f.abrangencia} = 'nacional'
              OR (${f.abrangencia} = 'uf' AND jurisdicao->>'uf' = ${f.uf})
              OR (${f.abrangencia} = 'tribunal' AND jurisdicao->>'tribunal' = ${f.tribunal})
              OR (${f.abrangencia} = 'comarca' AND jurisdicao->>'tribunal' = ${f.tribunal}
                  AND jurisdicao->>'comarca' = ${f.comarca}))
       ORDER BY tenant_id`;
    return linhas.map((l) => l.tenant_id as Uuid);
  }
}
