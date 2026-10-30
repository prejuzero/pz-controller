import { hoje } from '@pz/kernel';

import { FUSO_DOS_LEMBRETES } from '../domain/lembrete.js';
import { resumoDevido } from '../domain/resumo.js';

import { PREFERENCIAS_PADRAO } from './preferencias.js';

import type { NoTenant } from './lembretes.js';
import type { Notificar } from './notificacoes.js';
import type { RepositorioDePreferencias } from './preferencias.js';
import type { Clock, LocalDate, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

export interface ItemDoResumo {
  readonly numeroProcesso: string;
  readonly vencimento: string;
  readonly link: string;
}

export interface ConteudoDoResumo {
  readonly vencemHoje: readonly ItemDoResumo[];
  readonly proximos: readonly ItemDoResumo[];
  readonly semCiencia: readonly ItemDoResumo[];
  readonly intimacoes: readonly { readonly numeroProcesso: string; readonly link: string }[];
}

/** Portas do resumo, compostas pelas APIs públicas de identidade, prazos e publicações. */
export interface FontesDoResumo<Transacao> {
  /** Como sistema: escritórios ativos. */
  tenants(transacao: Transacao): Promise<readonly Uuid[]>;
  /** No tenant: quem acompanha os prazos. */
  usuarios(transacao: Transacao): Promise<readonly Uuid[]>;
  /** No tenant: os itens do usuário (responsável) no dia. */
  conteudo(usuarioId: Uuid, dia: LocalDate): Promise<ConteudoDoResumo>;
}

const dataBr = (data: LocalDate) => {
  const [ano, mes, dia] = data.paraIso().split('-');
  return `${dia ?? ''}/${mes ?? ''}/${ano ?? ''}`;
};

/**
 * Resumo diário (HU31, RF65): job a cada 15 min; quem tem o horário do resumo na janela recebe um
 * por dia (a chave da notificação usa a data). Resumo vazio não sai.
 */
export class EnviarResumosDiarios<Transacao> {
  constructor(
    private readonly sistema: UnidadeDeTrabalho<Transacao>,
    private readonly noTenant: NoTenant,
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly preferencias: RepositorioDePreferencias<Transacao>,
    private readonly fontes: FontesDoResumo<Transacao>,
    private readonly notificar: Notificar<Transacao>,
    private readonly urlDoPortal: string,
    private readonly relogio: Clock,
  ) {}

  async executar(): Promise<{ enviados: number; vazios: number }> {
    const agora = this.relogio.agora();
    const dia = hoje(this.relogio, FUSO_DOS_LEMBRETES);
    let enviados = 0;
    let vazios = 0;
    for (const tenantId of await this.sistema.executar((tx) => this.fontes.tenants(tx))) {
      await this.noTenant(tenantId, () =>
        this.unidade.executar(async (tx) => {
          for (const usuarioId of await this.fontes.usuarios(tx)) {
            const p = await this.preferencias.ler(tx, usuarioId);
            const horario = p.horarioResumo ?? PREFERENCIAS_PADRAO.horarioResumo;
            if (p.ativos?.['resumo-diario'] === false || !resumoDevido(horario, dia, agora))
              continue;
            const c = await this.fontes.conteudo(usuarioId, dia);
            if (
              c.vencemHoje.length +
                c.proximos.length +
                c.semCiencia.length +
                c.intimacoes.length ===
              0
            ) {
              vazios++;
              continue;
            }
            const r = await this.notificar.executar(tx, {
              tipo: 'resumo-diario',
              tenantId,
              usuarioId,
              janela: dia.paraIso(),
              dados: { data: dataBr(dia), ...c, link: new URL('/', this.urlDoPortal).toString() },
            });
            if (!r.ok) throw r.erro;
            if (r.valor.solicitada) enviados++;
          }
        }),
      );
    }
    return { enviados, vazios };
  }
}
