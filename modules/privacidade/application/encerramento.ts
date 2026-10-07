import { Conflito, err, NaoEncontrado, ok, Proibido } from '@pz/kernel';

import { novoEncerramento, situacaoDoEncerramento } from '../domain/encerramento.js';

import type {
  EncerradorDeSessoes,
  OperacoesDeEncerramento,
  RepositorioDeEncerramentos,
} from './portas.js';
import type { SituacaoDoEncerramento } from '../domain/encerramento.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { ArmazenamentoArquivos } from '@pz/integracoes';
import type { Clock, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

export interface ResponsavelPeloEscritorio {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
  /** Permissão `escritorio:encerrar`, conferida na API. */
  readonly podeEncerrar: boolean;
}

export interface EncerramentoListado {
  readonly situacao: SituacaoDoEncerramento | 'nenhum';
  readonly solicitadoEm: string | null;
  readonly efetivarEm: string | null;
}

const proibido = () =>
  new Proibido('encerramento-do-escritorio', 'Só o responsável pelo escritório encerra a conta.');

/**
 * Pedido de encerramento da conta (HU38): vale depois de 30 dias de carência, com trilha.
 * Pedido em carência é devolvido, não repetido.
 */
export class SolicitarEncerramento<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly encerramentos: RepositorioDeEncerramentos<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    responsavel: ResponsavelPeloEscritorio,
  ): Promise<Result<EncerramentoListado, Proibido>> {
    if (!responsavel.podeEncerrar) return err(proibido());
    const agora = this.relogio.agora();
    return this.unidade.executar(async (tx) => {
      const atual = await this.encerramentos.buscar(tx, responsavel.tenantId);
      if (atual !== undefined && situacaoDoEncerramento(atual, agora) !== 'cancelado') {
        return ok(listado(atual, agora));
      }
      const novo = novoEncerramento(responsavel.usuarioId, agora);
      await this.encerramentos.salvarPedido(tx, responsavel.tenantId, novo);
      await this.trilha.registrar(
        tx,
        {
          tipo: 'privacidade.encerramento-solicitado',
          entidade: 'tenant',
          entidadeId: responsavel.tenantId,
          depois: { efetivarEm: novo.efetivarEm.paraIso() },
        },
        { canal: responsavel.canal, usuarioId: responsavel.usuarioId },
      );
      return ok(listado(novo, agora));
    });
  }
}

/** Desistência dentro da carência (HU38), com trilha. */
export class CancelarEncerramento<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly encerramentos: RepositorioDeEncerramentos<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    responsavel: ResponsavelPeloEscritorio,
  ): Promise<Result<void, Proibido | NaoEncontrado | Conflito>> {
    if (!responsavel.podeEncerrar) return err(proibido());
    const agora = this.relogio.agora();
    return this.unidade.executar(async (tx) => {
      const atual = await this.encerramentos.buscar(tx, responsavel.tenantId);
      const situacao = atual === undefined ? 'nenhum' : situacaoDoEncerramento(atual, agora);
      if (situacao === 'nenhum' || situacao === 'cancelado') {
        return err(new NaoEncontrado('encerramento-inexistente', 'Não há pedido de encerramento.'));
      }
      if (situacao !== 'em-carencia') {
        return err(
          new Conflito(
            'carencia-encerrada',
            'A carência terminou; o encerramento não pode mais ser cancelado.',
          ),
        );
      }
      await this.encerramentos.cancelar(tx, responsavel.tenantId, agora);
      await this.trilha.registrar(
        tx,
        {
          tipo: 'privacidade.encerramento-cancelado',
          entidade: 'tenant',
          entidadeId: responsavel.tenantId,
        },
        { canal: responsavel.canal, usuarioId: responsavel.usuarioId },
      );
      return ok(undefined);
    });
  }
}

export class ConsultarEncerramento<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly encerramentos: RepositorioDeEncerramentos<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(tenantId: Uuid): Promise<EncerramentoListado> {
    const atual = await this.unidade.executar((tx) => this.encerramentos.buscar(tx, tenantId));
    return atual === undefined
      ? { situacao: 'nenhum', solicitadoEm: null, efetivarEm: null }
      : listado(atual, this.relogio.agora());
  }
}

function listado(
  e: Parameters<typeof situacaoDoEncerramento>[0],
  agora: Parameters<typeof situacaoDoEncerramento>[1],
): EncerramentoListado {
  return {
    situacao: situacaoDoEncerramento(e, agora),
    solicitadoEm: e.solicitadoEm.paraIso(),
    efetivarEm: e.efetivarEm.paraIso(),
  };
}

/**
 * Efetivação diária (HU38, job do worker como sistema): para cada encerramento vencido, encerra
 * as sessões, remove os arquivos exportados e, numa transação, registra na trilha do tenant e
 * chama a função do banco que apaga os dados de negócio e pseudonimiza as provas. Repetir é
 * seguro: sessões e arquivos já removidos não falham, e a função recusa o que já foi efetivado.
 */
export class EfetivarEncerramentos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly operacoes: OperacoesDeEncerramento<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly sessoes: EncerradorDeSessoes,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly relogio: Clock,
  ) {}

  async executar(): Promise<Uuid[]> {
    const agora = this.relogio.agora();
    const vencidos = await this.unidade.executar((tx) => this.operacoes.vencidos(tx, agora));
    for (const tenantId of vencidos) {
      const [usuarios, exportacoes] = await this.unidade.executar(async (tx) => [
        await this.operacoes.usuariosDoTenant(tx, tenantId),
        await this.operacoes.exportacoesDoTenant(tx, tenantId),
      ]);
      for (const usuarioId of usuarios) await this.sessoes.removerTodasDoUsuario(usuarioId);
      for (const id of exportacoes) {
        for (const arquivo of ['dados.json', 'dados.csv']) {
          await this.armazenamento.remover(tenantId, `privacidade/exportacoes/${id}/${arquivo}`);
        }
      }
      await this.unidade.executar(async (tx) => {
        await this.operacoes.entrarNoTenant(tx, tenantId);
        await this.trilha.registrar(
          tx,
          { tipo: 'privacidade.conta-encerrada', entidade: 'tenant', entidadeId: tenantId },
          { canal: 'sistema' },
        );
        await this.operacoes.efetivar(tx, tenantId);
      });
    }
    return vencidos;
  }
}
