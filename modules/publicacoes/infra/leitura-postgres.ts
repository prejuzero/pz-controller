import type {
  FiltroDaBuscaDePublicacoes,
  FiltroDePublicacoes,
  PublicacaoDoTenant,
  RepositorioDeLeitura,
} from '../application/portas.js';
import type { Transacao } from '@pz/db';
import type { Instant, Uuid } from '@pz/kernel';

interface Linha {
  conteudo_id: string;
  fonte: string;
  id_externo: string;
  numero_cnj: string | null;
  data_disponibilizacao: Date;
  teor: string;
  url_fonte: string;
  processo_id: string | null;
  oab_id: string | null;
  recebida_em: Date;
  capturado_em: Date;
  lida_em: Date | null;
  lida_por: string | null;
  metadados: Record<string, unknown>;
}

const texto = (v: unknown) => (typeof v === 'string' ? v : null);
const publicacao = (l: Linha): PublicacaoDoTenant => ({
  id: l.conteudo_id as Uuid,
  fonte: l.fonte,
  idExterno: l.id_externo,
  numeroCnj: l.numero_cnj,
  dataDisponibilizacao: l.data_disponibilizacao.toISOString().slice(0, 10),
  teor: l.teor,
  urlFonte: l.url_fonte,
  processoId: l.processo_id as Uuid | null,
  oabId: l.oab_id as Uuid | null,
  recebidaEm: l.recebida_em,
  capturadoEm: l.capturado_em,
  lidaEm: l.lida_em,
  lidaPor: l.lida_por as Uuid | null,
  siglaTribunal: texto(l.metadados.siglaTribunal),
  tipoComunicacao: texto(l.metadados.tipoComunicacao),
});

/** Filtro da busca como parâmetros ligados (nulo = sem filtro): consulta estática, sem SQL montado. */
function parametros(f: FiltroDaBuscaDePublicacoes) {
  return {
    processos: f.processoIds === undefined ? null : [...f.processoIds],
    oabs: f.oabIds === undefined ? null : [...f.oabIds],
    // Termos combinados com E; cada um em sintaxe de busca web (aspas, "-", "or").
    texto: f.textos === undefined || f.textos.length === 0 ? null : f.textos.join(' '),
    de: f.de ?? null,
    ate: f.ate ?? null,
    cursorData: f.depoisDe?.data ?? null,
    cursorId: f.depoisDe?.id ?? null,
  };
}

/** Leitura pela view `publicacao_do_tenant` (RLS dos destinatários) e marcação de leitura. */
export class LeituraPostgres implements RepositorioDeLeitura<Transacao> {
  async listar(tx: Transacao, f: FiltroDePublicacoes): Promise<PublicacaoDoTenant[]> {
    // Filtros opcionais como parâmetros (nulo = sem filtro): consulta estática, sem SQL montado.
    const novas = f.novas ?? null;
    const linhas = await tx.$queryRaw<Linha[]>`
      SELECT conteudo_id, fonte, id_externo, numero_cnj, data_disponibilizacao, teor, url_fonte,
             processo_id, oab_id, recebida_em, capturado_em, lida_em, lida_por, metadados
        FROM publicacao_do_tenant
       WHERE (${novas}::boolean IS NULL OR (lida_em IS NULL) = ${novas}::boolean)
         AND (${f.de ?? null}::date IS NULL OR data_disponibilizacao >= ${f.de ?? null}::date)
         AND (${f.ate ?? null}::date IS NULL OR data_disponibilizacao <= ${f.ate ?? null}::date)
         AND (${f.processoId ?? null}::uuid IS NULL OR processo_id = ${f.processoId ?? null}::uuid)
         AND (${f.antesDe ?? null}::uuid IS NULL OR conteudo_id < ${f.antesDe ?? null}::uuid)
       ORDER BY conteudo_id DESC
       LIMIT ${f.limite}`;
    return linhas.map(publicacao);
  }

  async buscar(tx: Transacao, id: Uuid): Promise<PublicacaoDoTenant | undefined> {
    const [linha] = await tx.$queryRaw<Linha[]>`
      SELECT conteudo_id, fonte, id_externo, numero_cnj, data_disponibilizacao, teor, url_fonte,
             processo_id, oab_id, recebida_em, capturado_em, lida_em, lida_por, metadados
        FROM publicacao_do_tenant WHERE conteudo_id = ${id}::uuid`;
    return linha === undefined ? undefined : publicacao(linha);
  }

  async buscarComFiltros(
    tx: Transacao,
    f: FiltroDaBuscaDePublicacoes,
  ): Promise<PublicacaoDoTenant[]> {
    const p = parametros(f);
    const linhas =
      f.ordem === 'asc'
        ? await tx.$queryRaw<Linha[]>`
      SELECT conteudo_id, fonte, id_externo, numero_cnj, data_disponibilizacao, teor, url_fonte,
             processo_id, oab_id, recebida_em, capturado_em, lida_em, lida_por, metadados
        FROM publicacao_do_tenant
       WHERE (${p.processos}::uuid[] IS NULL OR processo_id = ANY(${p.processos}::uuid[]))
         AND (${p.oabs}::uuid[] IS NULL OR oab_id = ANY(${p.oabs}::uuid[]))
         AND (${p.texto}::text IS NULL
              OR teor_tsv @@ websearch_to_tsquery('portugues_sem_acento', ${p.texto}::text))
         AND (${p.de}::date IS NULL OR data_disponibilizacao >= ${p.de}::date)
         AND (${p.ate}::date IS NULL OR data_disponibilizacao <= ${p.ate}::date)
         AND (${p.cursorId}::uuid IS NULL
              OR (data_disponibilizacao, conteudo_id) > (${p.cursorData}::date, ${p.cursorId}::uuid))
       ORDER BY data_disponibilizacao, conteudo_id
       LIMIT ${f.limite}`
        : await tx.$queryRaw<Linha[]>`
      SELECT conteudo_id, fonte, id_externo, numero_cnj, data_disponibilizacao, teor, url_fonte,
             processo_id, oab_id, recebida_em, capturado_em, lida_em, lida_por, metadados
        FROM publicacao_do_tenant
       WHERE (${p.processos}::uuid[] IS NULL OR processo_id = ANY(${p.processos}::uuid[]))
         AND (${p.oabs}::uuid[] IS NULL OR oab_id = ANY(${p.oabs}::uuid[]))
         AND (${p.texto}::text IS NULL
              OR teor_tsv @@ websearch_to_tsquery('portugues_sem_acento', ${p.texto}::text))
         AND (${p.de}::date IS NULL OR data_disponibilizacao >= ${p.de}::date)
         AND (${p.ate}::date IS NULL OR data_disponibilizacao <= ${p.ate}::date)
         AND (${p.cursorId}::uuid IS NULL
              OR (data_disponibilizacao, conteudo_id) < (${p.cursorData}::date, ${p.cursorId}::uuid))
       ORDER BY data_disponibilizacao DESC, conteudo_id DESC
       LIMIT ${f.limite}`;
    return linhas.map(publicacao);
  }

  async contarNaBusca(tx: Transacao, f: FiltroDaBuscaDePublicacoes, teto: number) {
    const p = parametros(f);
    const [linha] = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM (
        SELECT 1 FROM publicacao_do_tenant
         WHERE (${p.processos}::uuid[] IS NULL OR processo_id = ANY(${p.processos}::uuid[]))
           AND (${p.oabs}::uuid[] IS NULL OR oab_id = ANY(${p.oabs}::uuid[]))
           AND (${p.texto}::text IS NULL
                OR teor_tsv @@ websearch_to_tsquery('portugues_sem_acento', ${p.texto}::text))
           AND (${p.de}::date IS NULL OR data_disponibilizacao >= ${p.de}::date)
           AND (${p.ate}::date IS NULL OR data_disponibilizacao <= ${p.ate}::date)
         LIMIT ${teto}) t`;
    return Number(linha?.n ?? 0n);
  }

  async conteudosComTexto(tx: Transacao, texto: string, limite: number): Promise<Uuid[]> {
    const linhas = await tx.$queryRaw<{ conteudo_id: string }[]>`
      SELECT conteudo_id FROM publicacao_do_tenant
       WHERE teor_tsv @@ websearch_to_tsquery('portugues_sem_acento', ${texto}::text)
       LIMIT ${limite}`;
    return linhas.map((l) => l.conteudo_id as Uuid);
  }

  async contarNovas(tx: Transacao): Promise<number> {
    const [linha] = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM publicacao_do_tenant WHERE lida_em IS NULL`;
    return Number(linha?.n ?? 0n);
  }

  async marcarLida(tx: Transacao, id: Uuid, usuarioId: Uuid, em: Instant): Promise<boolean> {
    const { count } = await tx.publicacaoDestinatario.updateMany({
      where: { conteudoId: id, lidaEm: null },
      data: { lidaEm: new Date(em.epochMs), lidaPor: usuarioId },
    });
    return count === 1;
  }
}
