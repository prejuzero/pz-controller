import { err, gerarUuidV7, NaoEncontrado, NumeroCnj, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { lerPlanilhaDeProcessos } from '../domain/importacao.js';
import { Processo } from '../domain/processo.js';

import { origemDe } from './paginacao.js';
import { processoListado } from './processos.js';

import type { AutorNoTenant } from './paginacao.js';
import type {
  ImportacaoDeProcessos,
  RepositorioDeImportacoes,
  RepositorioDeProcessos,
} from './portas.js';
import type { LinhaDaPlanilha } from '../domain/importacao.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Outbox, ProblemaValidacao, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

export const EntradaDaImportacao = z
  .object({
    csv: z.string().min(1).max(1_000_000),
    somentePrevia: z.boolean().default(true),
  })
  .strict();

export interface LinhaDaPrevia {
  readonly linha: number;
  /** Com a máscara do CNJ; nulo se o número da linha é inválido. */
  readonly numeroCnj: string | null;
  /** `ja-cadastrado`: o processo já está no monitoramento e será ignorado. */
  readonly situacao: 'valida' | 'ja-cadastrado' | 'invalida';
  readonly problemas: readonly ProblemaValidacao[];
}

export interface ResultadoDaImportacao {
  readonly linhas: readonly LinhaDaPrevia[];
  /** Pedido gravado (o worker cadastra); nulo na prévia ou se alguma linha tem problema. */
  readonly importacaoId: Uuid | null;
}

export interface ImportacaoConsultada {
  readonly id: Uuid;
  readonly situacao: 'pendente' | 'concluida';
  readonly total: number;
  readonly criados: number | null;
  readonly jaExistiam: number | null;
  readonly solicitadaEm: string;
  readonly concluidaEm: string | null;
}

const mascara = (linha: LinhaDaPlanilha) => {
  if (linha.processo === undefined) return null;
  const numero = NumeroCnj.de(linha.processo.numeroCnj);
  return numero.ok ? numero.valor.formatado() : null;
};

/**
 * Importação de processos por CSV (HU42, RF04): a prévia valida cada linha e marca as já
 * cadastradas; com tudo válido, grava o pedido e o worker cadastra os processos (job assíncrono,
 * pelo evento). Tudo ou nada na validação, como as importações do calendário e da tabela.
 */
export class ImportarProcessos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly processos: RepositorioDeProcessos<Transacao>,
    private readonly importacoes: RepositorioDeImportacoes<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    autor: AutorNoTenant,
    entrada: unknown,
  ): Promise<Result<ResultadoDaImportacao, Validacao>> {
    const dados = EntradaDaImportacao.safeParse(entrada);
    if (!dados.success) {
      return err(new Validacao([{ campo: 'csv', mensagem: 'Envie o CSV (até 1 MB).' }]));
    }
    const lidas = lerPlanilhaDeProcessos(dados.data.csv);
    if (!lidas.ok) return lidas;

    return this.unidade.executar(async (tx) => {
      const linhas: LinhaDaPrevia[] = [];
      for (const lida of lidas.valor) {
        const existe =
          lida.processo !== undefined &&
          (await this.processos.buscarPorNumero(tx, lida.processo.numeroCnj)) !== undefined;
        linhas.push({
          linha: lida.linha,
          numeroCnj: mascara(lida),
          situacao: lida.processo === undefined ? 'invalida' : existe ? 'ja-cadastrado' : 'valida',
          problemas: lida.problemas,
        });
      }
      const validas = lidas.valor.flatMap((l, i) =>
        l.processo !== undefined && linhas[i]?.situacao === 'valida' ? [l.processo] : [],
      );
      if (dados.data.somentePrevia || linhas.some((l) => l.situacao === 'invalida')) {
        return ok({ linhas, importacaoId: null });
      }
      if (validas.length === 0) {
        return err(
          new Validacao([{ campo: 'csv', mensagem: 'Todos os processos já estão cadastrados.' }]),
        );
      }
      const agora = this.relogio.agora();
      const id = gerarUuidV7(this.relogio);
      await this.importacoes.inserir(tx, {
        id,
        tenantId: autor.tenantId,
        solicitadaPor: autor.usuarioId,
        linhas: validas,
        situacao: 'pendente',
        criados: null,
        jaExistiam: null,
        solicitadaEm: agora,
        concluidaEm: null,
      });
      await this.trilha.registrar(
        tx,
        {
          tipo: 'cadastro.importacao-solicitada',
          entidade: 'importacao_processo',
          entidadeId: id,
          depois: { total: validas.length, jaCadastrados: linhas.length - validas.length },
        },
        origemDe(autor),
      );
      await this.outbox.gravar(tx, [
        {
          id: gerarUuidV7(this.relogio),
          tipo: 'ImportacaoDeProcessosSolicitada',
          versao: 1,
          tenantId: autor.tenantId,
          agregadoId: id,
          ocorridoEm: agora,
          payload: { importacaoId: id },
        },
      ]);
      return ok({ linhas, importacaoId: id });
    });
  }
}

export type DesfechoDaImportacao = 'concluida' | 'ja-concluida';

/**
 * Cadastra os processos de uma importação (worker, na transação do consumo do evento). Tudo numa
 * transação: repetir o evento encontra a importação concluída e não refaz nada. Processo que já
 * existe (cadastrado depois da prévia ou pela captura) conta como "já existia".
 */
export class ProcessarImportacaoDeProcessos<Transacao> {
  constructor(
    private readonly processos: RepositorioDeProcessos<Transacao>,
    private readonly importacoes: RepositorioDeImportacoes<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    tx: Transacao,
    evento: { readonly tenantId: Uuid; readonly payload: { readonly importacaoId: string } },
  ): Promise<DesfechoDaImportacao> {
    const id = evento.payload.importacaoId as Uuid;
    const importacao = await this.importacoes.buscar(tx, id);
    if (importacao === undefined) throw new Error(`Importação ${id} não encontrada no tenant`);
    if (importacao.situacao === 'concluida') return 'ja-concluida';
    const autoria = { canal: 'sistema' as const, usuarioId: importacao.solicitadaPor };
    let criados = 0;
    for (const linha of importacao.linhas) {
      const numero = NumeroCnj.de(linha.numeroCnj);
      // Linhas gravadas já validadas: falha aqui é defeito, não dado.
      if (!numero.ok) throw numero.erro;
      const criado = Processo.monitorar(
        {
          tenantId: evento.tenantId,
          numero: numero.valor,
          orgao: linha.orgao,
          comarca: linha.comarca,
          sigiloso: linha.sigiloso,
          origem: 'manual',
        },
        this.relogio,
      );
      if (!criado.ok) throw criado.erro;
      const processo = criado.valor;
      if (!(await this.processos.inserir(tx, processo))) continue;
      criados++;
      await this.trilha.registrar(
        tx,
        {
          tipo: 'cadastro.processo-cadastrado',
          entidade: 'processo',
          entidadeId: processo.id,
          depois: { ...processoListado(processo.estado), importacaoId: id },
        },
        autoria,
      );
      await this.outbox.gravar(tx, processo.retirarEventos());
    }
    const desfecho = { criados, jaExistiam: importacao.linhas.length - criados };
    await this.importacoes.concluir(tx, id, { ...desfecho, em: this.relogio.agora() });
    await this.trilha.registrar(
      tx,
      {
        tipo: 'cadastro.importacao-concluida',
        entidade: 'importacao_processo',
        entidadeId: id,
        depois: desfecho,
      },
      autoria,
    );
    return 'concluida';
  }
}

/** Andamento de uma importação do escritório (o portal acompanha até concluir). */
export class ConsultarImportacaoDeProcessos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly importacoes: RepositorioDeImportacoes<Transacao>,
  ) {}

  async executar(id: Uuid): Promise<Result<ImportacaoConsultada, NaoEncontrado>> {
    const i = await this.unidade.executar((tx) => this.importacoes.buscar(tx, id));
    if (i === undefined) {
      return err(new NaoEncontrado('importacao-nao-encontrada', 'Importação não encontrada.'));
    }
    return ok(consultada(i));
  }
}

const consultada = (i: ImportacaoDeProcessos): ImportacaoConsultada => ({
  id: i.id,
  situacao: i.situacao,
  total: i.linhas.length,
  criados: i.criados,
  jaExistiam: i.jaExistiam,
  solicitadaEm: i.solicitadaEm.paraIso(),
  concluidaEm: i.concluidaEm?.paraIso() ?? null,
});
