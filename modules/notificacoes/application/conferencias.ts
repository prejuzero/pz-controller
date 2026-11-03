import { hoje } from '@pz/kernel';

import type { NoTenant } from './lembretes.js';
import type { Notificar } from './notificacoes.js';
import type { ResponsaveisDoEscritorio } from './portas.js';
import type { Clock, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Processo que exige conferência de painel, como o cadastro informa (HU36). */
export interface ConferenciaDevida {
  readonly processoId: Uuid;
  readonly numeroCnj: string;
  readonly sigiloso: boolean;
  /** Data da conferência devida (AAAA-MM-DD, Brasília). */
  readonly proxima: string;
  readonly lembrarHoje: boolean;
}

/** Página do portal com as conferências pendentes. */
const PAGINA = '/conferencias';

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Lembretes de conferência de painel (HU36, RF91): job diário. Para cada escritório com processo
 * sigiloso ou fora da cobertura, avisa quem responde pelas intimações nos dias devidos (o dia e,
 * depois, a cada período). A janela (dia + processo) torna o envio idempotente: repetir o job no
 * mesmo dia não duplica. Processo sigiloso não é identificado no e-mail.
 */
export class LembrarConferencias<Transacao> {
  constructor(
    private readonly sistema: UnidadeDeTrabalho<Transacao>,
    private readonly tenants: (transacao: Transacao) => Promise<readonly Uuid[]>,
    private readonly noTenant: NoTenant,
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly devidas: () => Promise<readonly ConferenciaDevida[]>,
    private readonly responsaveis: ResponsaveisDoEscritorio<Transacao>,
    private readonly notificar: Notificar<Transacao>,
    private readonly urlDoPortal: string,
    private readonly relogio: Clock,
  ) {}

  async executar(): Promise<{ escritorios: number; avisos: number }> {
    const dia = hoje(this.relogio).paraIso();
    const enderecoDaPagina = new URL(PAGINA, this.urlDoPortal).toString();
    const tenants = await this.sistema.executar((tx) => this.tenants(tx));
    let avisos = 0;
    for (const tenantId of tenants) {
      avisos += await this.noTenant(tenantId, async () => {
        const hojeDevidas = (await this.devidas()).filter((c) => c.lembrarHoje);
        if (hojeDevidas.length === 0) return 0;
        return this.unidade.executar(async (tx) => {
          let pedidos = 0;
          for (const usuarioId of await this.responsaveis.usuarios(tx)) {
            for (const c of hojeDevidas) {
              const r = await this.notificar.executar(tx, {
                tipo: 'conferencia-painel',
                tenantId,
                usuarioId,
                janela: `${dia}:${c.processoId.replaceAll('-', '').slice(-20)}`,
                dados: {
                  ...(c.sigiloso ? {} : { numeroProcesso: c.numeroCnj }),
                  desde: dataBr(c.proxima),
                  link: enderecoDaPagina,
                },
              });
              // Dados montados aqui: inválido é defeito, não entrada do usuário (vai para a DLQ).
              if (!r.ok) throw r.erro;
              if (r.valor.solicitada) pedidos += 1;
            }
          }
          return pedidos;
        });
      });
    }
    return { escritorios: tenants.length, avisos };
  }
}
