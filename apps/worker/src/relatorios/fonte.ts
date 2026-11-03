import { Buscar } from '@pz/busca';
import {
  AdvogadosPostgres,
  OabsParaBusca,
  ProcessosParaBusca,
  ProcessosPostgres,
} from '@pz/cadastro';
import { NomesDosUsuariosPostgres } from '@pz/identidade';
import { formatarNumeroCnj, lerNumeroCnj } from '@pz/kernel';
import { BuscarPrazos, prazoDetalhado, PrazosPostgres } from '@pz/prazos';
import { BuscarPublicacoes, LeituraPostgres } from '@pz/publicacoes';

import type { ProtecaoDeCampos } from '@pz/cadastro';
import type { Banco } from '@pz/db';
import type { Clock } from '@pz/kernel';
import type { FonteDosRelatorios } from '@pz/relatorios';

/**
 * Fonte dos relatórios (HU29): a mesma busca da HU28, composta como na api, para o relatório
 * bater com a tela. Roda no tenant do job (RLS).
 */
export function fonteDosRelatorios(
  banco: Banco,
  relogio: Clock,
  protecao: ProtecaoDeCampos,
): FonteDosRelatorios {
  const publicacoes = new BuscarPublicacoes(banco, new LeituraPostgres());
  const processos = new ProcessosParaBusca(banco, new ProcessosPostgres(relogio));
  const oabs = new OabsParaBusca(banco, new AdvogadosPostgres(relogio, protecao));
  const prazos = new BuscarPrazos(banco, new PrazosPostgres());
  const nomes = new NomesDosUsuariosPostgres();
  const repositorioDePrazos = new PrazosPostgres();
  const repositorioDeProcessos = new ProcessosPostgres(relogio);
  const leitura = new LeituraPostgres();
  const buscar = new Buscar(
    {
      processos: (f) => processos.executar(f),
      oabs: (texto) => oabs.executar(texto),
      conteudosComTexto: (texto) => publicacoes.conteudosComTexto(texto),
      prazos: (f) => prazos.executar(f),
      publicacoes: (f) => publicacoes.executar(f),
      // Só a busca rápida usa; o relatório não.
      processosPorNumero: () => Promise.resolve([]),
    },
    relogio,
  );
  return {
    prazos: (filtros) => buscar.prazos(filtros),
    publicacoes: (filtros) => buscar.publicacoes(filtros),
    // Envio manual (HU32): um prazo (com o número do processo) ou uma publicação do tenant.
    prazo: (id) =>
      banco.executar(async (tx) => {
        const prazo = await repositorioDePrazos.buscar(tx, id);
        if (prazo === undefined) return undefined;
        const detalhe = prazoDetalhado(prazo.estado);
        const processo = await repositorioDeProcessos.buscar(tx, detalhe.processoId);
        const partes = processo === undefined ? undefined : lerNumeroCnj(processo.estado.numeroCnj);
        return {
          prazo: detalhe,
          ...(partes === undefined ? {} : { numeroProcesso: formatarNumeroCnj(partes) }),
        };
      }),
    publicacao: (id) => banco.executar((tx) => leitura.buscar(tx, id)),
    nomeDoUsuario: async (usuarioId) =>
      (await banco.executar((tx) => nomes.nomeDe(tx, usuarioId))) ?? '',
  };
}
