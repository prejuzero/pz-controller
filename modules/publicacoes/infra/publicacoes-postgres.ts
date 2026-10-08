import type {
  ConteudoRegistrado,
  NovoDestinatario,
  PublicacaoParaRegistrar,
  RepositorioDePublicacoes,
} from '../application/portas.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/** Conteúdo pela função do banco (ADR-014) e destinatários no tenant da transação (RLS). */
export class PublicacoesPostgres implements RepositorioDePublicacoes<Transacao> {
  async registrarConteudo(tx: Transacao, p: PublicacaoParaRegistrar): Promise<ConteudoRegistrado> {
    const [linha] = await tx.$queryRaw<
      { conteudo_id: string; capturado_em: Date; novo: boolean }[]
    >`
      SELECT * FROM pz_registrar_publicacao(${p.id}::uuid, ${p.fonte}, ${p.idExterno},
        ${p.hashConteudo}, ${p.dataDisponibilizacao}::date, ${p.numeroCnj}, ${p.teor},
        ${p.urlFonte}, ${JSON.stringify(p.metadados)}::jsonb, ${p.adaptadorVersao})`;
    if (linha === undefined) throw new Error('pz_registrar_publicacao não devolveu o conteúdo');
    return {
      conteudoId: linha.conteudo_id as Uuid,
      capturadoEm: linha.capturado_em,
      novo: linha.novo,
    };
  }

  async registrarDestinatario(tx: Transacao, d: NovoDestinatario): Promise<boolean> {
    const { count } = await tx.publicacaoDestinatario.createMany({
      data: [
        {
          tenantId: d.tenantId,
          conteudoId: d.conteudoId,
          conteudoCapturadoEm: d.capturadoEm,
          processoId: d.processoId,
          oabId: d.oabId,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }
}
