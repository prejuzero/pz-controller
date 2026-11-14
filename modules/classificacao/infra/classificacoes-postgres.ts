import type { RepositorioDeClassificacoes } from '../application/classificar-publicacao.js';
import type { RepositorioDeFalhasDaIa } from '../application/reprocessar-falhas.js';
import type { Classificacao } from '../domain/decisao.js';
import type { Transacao } from '@pz/db';
import type { Instant, Uuid } from '@pz/kernel';

const json = (valor: unknown) => (valor === null ? null : JSON.stringify(valor));

/** Classificações no PostgreSQL (tabela global `classificacao`, uma por conteúdo). */
export class ClassificacoesPostgres
  implements RepositorioDeClassificacoes<Transacao>, RepositorioDeFalhasDaIa<Transacao>
{
  async existe(tx: Transacao, conteudoId: Uuid): Promise<boolean> {
    return (await tx.classificacao.count({ where: { conteudoId } })) === 1;
  }

  async gravar(tx: Transacao, conteudoId: Uuid, c: Classificacao): Promise<boolean> {
    // Outro consumidor gravou antes: a primeira classificação vale (ON CONFLICT DO NOTHING).
    const gravadas = await tx.$executeRaw`
      INSERT INTO classificacao (conteudo_id, origem, situacao, tipo_ato, confianca, prazo_citado,
        evidencias, regra_codigo, regra_versao, versao_prompt, modelo, motivo)
      VALUES (${conteudoId}::uuid, ${c.origem}, ${c.situacao}, ${c.tipoAto}, ${c.confianca},
        ${json(c.prazoCitado)}::jsonb, ${JSON.stringify(c.evidencias)}::jsonb,
        ${c.regra?.codigo ?? null}, ${c.regra?.versao ?? null}, ${c.versaoPrompt ?? null},
        ${c.modelo ?? null}, ${c.motivo ?? null})
      ON CONFLICT (conteudo_id) DO NOTHING`;
    return gravadas === 1;
  }

  async pendentes(tx: Transacao, tentadaAntesDe: Instant, limite: number): Promise<Uuid[]> {
    // Nunca tentada de novo (atualizado_em = criado_em) entra já; tentada, só depois do intervalo.
    const linhas = await tx.$queryRaw<{ conteudo_id: string }[]>`
      SELECT conteudo_id FROM classificacao
       WHERE situacao = 'revisao_manual' AND motivo = 'saida-invalida'
         AND (atualizado_em = criado_em OR atualizado_em < ${new Date(tentadaAntesDe.epochMs)})
       ORDER BY conteudo_id
       LIMIT ${limite}`;
    return linhas.map((l) => l.conteudo_id as Uuid);
  }

  async substituir(tx: Transacao, conteudoId: Uuid, c: Classificacao): Promise<boolean> {
    const trocadas = await tx.$executeRaw`
      UPDATE classificacao SET origem = ${c.origem}, situacao = ${c.situacao},
        tipo_ato = ${c.tipoAto}, confianca = ${c.confianca},
        prazo_citado = ${json(c.prazoCitado)}::jsonb, evidencias = ${JSON.stringify(c.evidencias)}::jsonb,
        regra_codigo = ${c.regra?.codigo ?? null}, regra_versao = ${c.regra?.versao ?? null},
        versao_prompt = ${c.versaoPrompt ?? null}, modelo = ${c.modelo ?? null},
        motivo = ${c.motivo ?? null}, atualizado_em = now()
       WHERE conteudo_id = ${conteudoId}::uuid
         AND situacao = 'revisao_manual' AND motivo = 'saida-invalida'`;
    return trocadas === 1;
  }

  async registrarTentativa(tx: Transacao, conteudoId: Uuid, em: Instant): Promise<void> {
    await tx.$executeRaw`
      UPDATE classificacao SET atualizado_em = ${new Date(em.epochMs)}
       WHERE conteudo_id = ${conteudoId}::uuid`;
  }

  /** O que a classificação disse do conteúdo (lido pelo módulo prazos, HU24); nunca uma data. */
  async buscar(tx: Transacao, conteudoId: Uuid): Promise<ClassificacaoLida | undefined> {
    const l = await tx.classificacao.findUnique({ where: { conteudoId } });
    if (l === null) return undefined;
    return {
      tipoAto: l.tipoAto,
      situacao: l.situacao as ClassificacaoLida['situacao'],
      confianca: l.confianca === null ? null : Number(l.confianca),
      prazoCitado: (l.prazoCitado ?? null) as ClassificacaoLida['prazoCitado'],
    };
  }
}

/** Classificação gravada, como os outros módulos a leem (API pública). */
export interface ClassificacaoLida {
  readonly tipoAto: string | null;
  readonly situacao: 'ok' | 'a_confirmar' | 'revisao_manual';
  readonly confianca: number | null;
  readonly prazoCitado: {
    readonly quantidade: number;
    readonly unidade: 'dias' | 'dias-uteis' | 'horas' | 'meses' | 'anos';
    readonly unidadeImplicita: boolean;
    readonly divergente: boolean;
  } | null;
}
