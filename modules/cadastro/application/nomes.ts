import {
  Conflito,
  err,
  gerarUuidV7,
  NaoEncontrado,
  nomeMonitoradoCanonico,
  ok,
  RegraDeNegocio,
  TAMANHO_DO_NOME_MONITORADO,
  Validacao,
} from '@pz/kernel';
import { z } from 'zod';

import { origemDe } from './paginacao.js';

import type { AutorNoTenant } from './paginacao.js';
import type { NomeMonitorado, RepositorioDeNomesMonitorados } from './portas.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Até 5 nomes por escritório (decisão do usuário em 08/11/2026): razão social, fantasia etc. */
export const MAXIMO_DE_NOMES_MONITORADOS = 5;

const EntradaDoNome = z.object({ nome: z.string().max(300) }).strict();

export interface NomeListado {
  readonly id: Uuid;
  readonly nome: string;
  readonly criadoEm: string;
}

const listado = (n: NomeMonitorado): NomeListado => ({
  id: n.id,
  nome: n.nome,
  criadoEm: n.criadoEm.paraIso(),
});

/** Nomes ativos do escritório (HU42), em ordem de cadastro. */
export class ListarNomesMonitorados<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly nomes: RepositorioDeNomesMonitorados<Transacao>,
  ) {}

  async executar(): Promise<NomeListado[]> {
    const nomes = await this.unidade.executar((tx) => this.nomes.ativos(tx));
    return nomes.map(listado);
  }
}

/**
 * Passa a monitorar um nome do escritório (HU42, RF05): a captura assina o alvo pelo evento. O que
 * chegar só por este nome fica "a conferir" (homônimos).
 */
export class AdicionarNomeMonitorado<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly nomes: RepositorioDeNomesMonitorados<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    autor: AutorNoTenant,
    entrada: unknown,
  ): Promise<Result<NomeListado, Validacao | Conflito | RegraDeNegocio>> {
    const dados = EntradaDoNome.safeParse(entrada);
    const valor = dados.success ? nomeMonitoradoCanonico(dados.data.nome) : undefined;
    if (!dados.success || valor === undefined) {
      const { minimo, maximo } = TAMANHO_DO_NOME_MONITORADO;
      return err(
        new Validacao([
          { campo: 'nome', mensagem: `De ${String(minimo)} a ${String(maximo)} caracteres.` },
        ]),
      );
    }
    const nome: NomeMonitorado = {
      id: gerarUuidV7(this.relogio),
      tenantId: autor.tenantId,
      nome: dados.data.nome.replace(/\s+/g, ' ').trim(),
      valor,
      criadoPor: autor.usuarioId,
      criadoEm: this.relogio.agora(),
    };
    return this.unidade.executar(async (tx) => {
      if ((await this.nomes.ativos(tx)).length >= MAXIMO_DE_NOMES_MONITORADOS) {
        return err(
          new RegraDeNegocio(
            'limite-de-nomes',
            `Até ${String(MAXIMO_DE_NOMES_MONITORADOS)} nomes por escritório.`,
          ),
        );
      }
      if (!(await this.nomes.inserir(tx, nome))) {
        return err(new Conflito('nome-ja-monitorado', 'Este nome já está no monitoramento.'));
      }
      const depois = listado(nome);
      await this.trilha.registrar(
        tx,
        {
          tipo: 'cadastro.nome-monitorado-adicionado',
          entidade: 'nome_monitorado',
          entidadeId: nome.id,
          depois,
        },
        origemDe(autor),
      );
      await this.outbox.gravar(tx, [evento(this.relogio, 'NomeMonitoradoAdicionado', nome)]);
      return ok(depois);
    });
  }
}

/** Deixa de monitorar o nome (HU42): a captura desassina; o histórico fica. */
export class RemoverNomeMonitorado<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly nomes: RepositorioDeNomesMonitorados<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(autor: AutorNoTenant, id: Uuid): Promise<Result<void, NaoEncontrado>> {
    return this.unidade.executar(async (tx) => {
      const removido = await this.nomes.remover(tx, id, {
        por: autor.usuarioId,
        em: this.relogio.agora(),
      });
      if (removido === undefined) {
        return err(new NaoEncontrado('nome-nao-encontrado', 'Nome não encontrado.'));
      }
      await this.trilha.registrar(
        tx,
        {
          tipo: 'cadastro.nome-monitorado-removido',
          entidade: 'nome_monitorado',
          entidadeId: id,
          antes: listado(removido),
        },
        origemDe(autor),
      );
      await this.outbox.gravar(tx, [evento(this.relogio, 'NomeMonitoradoRemovido', removido)]);
      return ok(undefined);
    });
  }
}

function evento(relogio: Clock, tipo: string, nome: NomeMonitorado) {
  return {
    id: gerarUuidV7(relogio),
    tipo,
    versao: 1,
    tenantId: nome.tenantId,
    agregadoId: nome.id,
    ocorridoEm: relogio.agora(),
    payload: { nomeId: nome.id, nome: nome.valor },
  };
}
