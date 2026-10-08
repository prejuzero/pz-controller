import type { RepositorioDeClassificacoes } from '../application/classificar-publicacao.js';
import type { Classificacao } from '../domain/decisao.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

const json = (valor: unknown) => (valor === null ? null : JSON.stringify(valor));

/** Classificações no PostgreSQL (tabela global `classificacao`, uma por conteúdo). */
export class ClassificacoesPostgres implements RepositorioDeClassificacoes<Transacao> {
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
}
