import { fusoDoJuizo, jurisdicaoDoProcesso } from '@pz/calendario';

import type { ConsultarProcesso, AdvogadosPostgres } from '@pz/cadastro';
import type { ConsultarDiasNaoUteis } from '@pz/calendario';
import type { ClassificacoesPostgres } from '@pz/classificacao';
import type { Transacao } from '@pz/db';
import type { UnidadeDeTrabalho, Uuid } from '@pz/kernel';
import type { FontesDaGeracao, LocalizadorDoProcesso } from '@pz/prazos';
import type { DestinatariosPostgres } from '@pz/publicacoes';

/**
 * O processo visto pelo cálculo de prazos, montado pelas APIs públicas do cadastro e do
 * calendario (CLAUDE.md, seção 6). Sem regra aqui: só composição.
 */
export function processoNoCalendario(
  processos: Pick<ConsultarProcesso<unknown>, 'executar'>,
  dias: Pick<ConsultarDiasNaoUteis<unknown>, 'diasNaoUteis'>,
): LocalizadorDoProcesso {
  return async (processoId) => {
    const r = await processos.executar(processoId);
    if (!r.ok) return undefined;
    const { tribunal, comarca, ramo } = r.valor;
    const { jurisdicao, lacunas } = jurisdicaoDoProcesso({ tribunal, comarca });
    return {
      ramoDoTribunal: ramo,
      jurisdicao,
      lacunas,
      fuso: fusoDoJuizo(tribunal),
      diasNaoUteis: async (inicio, fim) =>
        (await dias.diasNaoUteis(jurisdicao, inicio, fim)).map((dia) => ({
          data: dia.data,
          tipo: dia.tipo,
          motivo: dia.motivo,
          atoNormativo: dia.fonte.atoNormativo,
          urlAto: dia.fonte.urlAto,
        })),
    };
  };
}

type Unidade = Pick<UnidadeDeTrabalho<Transacao>, 'executar'>;

/** Classificação, destinatário e responsável da publicação, pelas APIs dos módulos (HU24). */
export function fontesDaGeracao(
  unidade: Unidade,
  classificacoes: Pick<ClassificacoesPostgres, 'buscar'>,
  destinatarios: Pick<DestinatariosPostgres, 'doConteudo'>,
  advogados: Pick<AdvogadosPostgres, 'usuarioDaOab'>,
): FontesDaGeracao {
  return {
    classificacao: (id) => unidade.executar((tx) => classificacoes.buscar(tx, id)),
    destinatario: (id) => unidade.executar((tx) => destinatarios.doConteudo(tx, id)),
    responsavelDaOab: (id) => unidade.executar((tx) => advogados.usuarioDaOab(tx, id)),
  };
}

/** Tenants que receberam o conteúdo, lidos como sistema (HU24). */
export function tenantsDaPublicacao(
  sistema: Unidade,
  destinatarios: Pick<DestinatariosPostgres, 'tenantsDoConteudo'>,
): (conteudoId: Uuid) => Promise<Uuid[]> {
  return (conteudoId) => sistema.executar((tx) => destinatarios.tenantsDoConteudo(tx, conteudoId));
}
