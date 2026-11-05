import { EmitirHistoricoVerificavel, HistoricoPostgres, sha256 } from '@pz/auditoria';
import { Buscar } from '@pz/busca';
import {
  AdvogadosPostgres,
  ClientesPostgres,
  ConsultarCliente,
  OabsParaBusca,
  ProcessosParaBusca,
  ProcessosPostgres,
} from '@pz/cadastro';
import { CienciaPostgres } from '@pz/ciencia';
import { NomesDosUsuariosPostgres } from '@pz/identidade';
import { formatarNumeroCnj, Instant, lerNumeroCnj } from '@pz/kernel';
import { NotificacoesPostgres } from '@pz/notificacoes';
import { BuscarPrazos, prazoDetalhado, PrazosPostgres } from '@pz/prazos';
import { BuscarPublicacoes, LeituraPostgres } from '@pz/publicacoes';

import type { ProtecaoDeCampos } from '@pz/cadastro';
import type { Banco } from '@pz/db';
import type { Clock, Uuid } from '@pz/kernel';
import type { FonteDosRelatorios } from '@pz/relatorios';

/**
 * Fonte dos relatórios (HU29): a mesma busca da HU28, composta como na api, para o relatório
 * bater com a tela. Roda no tenant do job (RLS).
 */
export function fonteDosRelatorios(
  banco: Banco,
  relogio: Clock,
  protecao: ProtecaoDeCampos,
  portal: string,
): FonteDosRelatorios {
  const historico = new EmitirHistoricoVerificavel(banco, new HistoricoPostgres(), sha256);
  const publicacoes = new BuscarPublicacoes(banco, new LeituraPostgres());
  const processos = new ProcessosParaBusca(banco, new ProcessosPostgres(relogio));
  const oabs = new OabsParaBusca(banco, new AdvogadosPostgres(relogio, protecao));
  const prazos = new BuscarPrazos(banco, new PrazosPostgres());
  const nomes = new NomesDosUsuariosPostgres();
  const clientes = new ConsultarCliente(banco, new ClientesPostgres(protecao));
  const repositorioDePrazos = new PrazosPostgres();
  const repositorioDeProcessos = new ProcessosPostgres(relogio);
  const leitura = new LeituraPostgres();
  const ciencia = new CienciaPostgres();
  const notificacoesDoPrazo = new NotificacoesPostgres();
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
    // Controle de ciência (HU34): confirmações (ciência) e notificações por prazo, no tenant.
    controleDeCiencia: (prazoIds) =>
      banco.executar(async (tx) => {
        const ids = prazoIds as Uuid[];
        const [confirmacoes, notificacoes] = [
          await ciencia.confirmacoes(tx, ids),
          await notificacoesDoPrazo.resumoPorPrazo(tx, ids),
        ];
        return new Map(
          ids.map((id) => {
            const c = confirmacoes.get(id);
            const n = notificacoes.get(id) ?? { enviadas: 0, entregues: 0, rejeitadas: 0 };
            return [id, { ...n, ...(c ?? {}) }] as const;
          }),
        );
      }),
    // Histórico verificável (HU35): o prazo e as notificações dele; a emissão fica gravada.
    historicoDoPrazo: async (prazoId) => {
      const alvo = await banco.executar(async (tx) => {
        const prazo = await repositorioDePrazos.buscar(tx, prazoId as Uuid);
        if (prazo === undefined) return undefined;
        const ids = await notificacoesDoPrazo.idsDoPrazo(tx, prazoId as Uuid);
        return { tenantId: prazo.estado.tenantId, ids };
      });
      if (alvo === undefined) return undefined;
      const principal = { entidade: 'prazo', entidadeId: prazoId };
      const { eventos, codigo } = await historico.executar(alvo.tenantId, principal, [
        principal,
        ...alvo.ids.map((id) => ({ entidade: 'notificacao', entidadeId: id })),
      ]);
      const nomesDe = await banco.executar(async (tx) => {
        const ids = [
          ...new Set(eventos.flatMap((e) => (e.usuarioId === null ? [] : [e.usuarioId]))),
        ];
        return new Map(
          await Promise.all(
            ids.map(async (id) => [id, (await nomes.nomeDe(tx, id as Uuid)) ?? ''] as const),
          ),
        );
      });
      return {
        eventos: eventos.map((e) => ({
          sequencia: e.sequencia,
          criadoEm: Instant.deIso(e.criadoEm),
          tipo: e.tipo,
          usuario: e.usuarioId === null ? '' : (nomesDe.get(e.usuarioId) ?? ''),
          canal: e.canal,
          hashAnterior: e.hashAnterior,
          hash: e.hash,
        })),
        codigo,
        url: `${portal.replace(/\/$/, '')}/verificar/${codigo}`,
      };
    },
    nomeDoUsuario: async (usuarioId) =>
      (await banco.executar((tx) => nomes.nomeDe(tx, usuarioId))) ?? '',
    // Filtro impresso com o nome do cliente (PZ-352), pela API pública do cadastro.
    nomeDoCliente: async (clienteId) => {
      const r = await clientes.executar(clienteId);
      return r.ok ? r.valor.nome : undefined;
    },
  };
}
