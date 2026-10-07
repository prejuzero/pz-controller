import type {
  AlvoDevido,
  AlvoParaEntrega,
  RepositorioDaCaptura,
  RepositorioDeAssinaturas,
} from '../application/portas.js';
import type { JanelaDaCaptura, TipoDeAlvo } from '../domain/alvo.js';
import type { Instant, LocalDate, TransacaoEmMemoria, Uuid } from '@pz/kernel';

interface Alvo {
  id: Uuid;
  tipo: TipoDeAlvo;
  valor: string;
  ativo: boolean;
  ultimaJanelaFim?: LocalDate;
  ultimaChave?: string;
  ultimoSucesso?: Instant;
  proximaExecucao?: Instant;
  falhasConsecutivas: number;
}

/** Alvos e assinaturas em memória, com a semântica do Postgres. Só para testes. */
export class CapturaEmMemoria
  implements RepositorioDeAssinaturas<TransacaoEmMemoria>, RepositorioDaCaptura<TransacaoEmMemoria>
{
  readonly alvos = new Map<string, Alvo>();
  readonly assinaturas: { alvoId: Uuid; tenantId: Uuid; referencia: Uuid }[] = [];

  alvo(tipo: TipoDeAlvo, valor: string): Alvo | undefined {
    return [...this.alvos.values()].find((a) => a.tipo === tipo && a.valor === valor);
  }

  obterOuCriarAlvo(_tx: TransacaoEmMemoria, tipo: TipoDeAlvo, valor: string, idNovo: Uuid) {
    const existente = this.alvo(tipo, valor);
    if (existente !== undefined) return Promise.resolve(existente.id);
    this.alvos.set(idNovo, { id: idNovo, tipo, valor, ativo: true, falhasConsecutivas: 0 });
    return Promise.resolve(idNovo);
  }

  assinar(_tx: TransacaoEmMemoria, alvoId: Uuid, tenantId: Uuid, referencia: Uuid) {
    const igual = (a: { alvoId: Uuid; tenantId: Uuid; referencia: Uuid }) =>
      a.alvoId === alvoId && a.tenantId === tenantId && a.referencia === referencia;
    if (!this.assinaturas.some(igual)) this.assinaturas.push({ alvoId, tenantId, referencia });
    return Promise.resolve();
  }

  desassinar(
    _tx: TransacaoEmMemoria,
    tipo: TipoDeAlvo,
    valor: string,
    tenantId: Uuid,
    referencia: Uuid,
  ) {
    const alvo = this.alvo(tipo, valor);
    const indice = this.assinaturas.findIndex(
      (a) => a.alvoId === alvo?.id && a.tenantId === tenantId && a.referencia === referencia,
    );
    if (indice >= 0) this.assinaturas.splice(indice, 1);
    return Promise.resolve();
  }

  devidos(_tx: TransacaoEmMemoria, agora: Instant): Promise<AlvoDevido[]> {
    return Promise.resolve(
      [...this.alvos.values()]
        .filter(
          (a) =>
            a.ativo &&
            this.assinaturas.some((s) => s.alvoId === a.id) &&
            !a.proximaExecucao?.ehDepoisDe(agora),
        )
        .map((a) => ({
          id: a.id,
          tipo: a.tipo,
          valor: a.valor,
          ...(a.ultimaJanelaFim === undefined ? {} : { ultimaJanelaFim: a.ultimaJanelaFim }),
        })),
    );
  }

  travar(_tx: TransacaoEmMemoria, alvoId: Uuid): Promise<AlvoParaEntrega | undefined> {
    const alvo = this.alvos.get(alvoId);
    if (alvo === undefined) return Promise.resolve(undefined);
    const porTenant = new Map<Uuid, Uuid[]>();
    for (const s of this.assinaturas.filter((a) => a.alvoId === alvoId)) {
      porTenant.set(s.tenantId, [...(porTenant.get(s.tenantId) ?? []), s.referencia]);
    }
    return Promise.resolve({
      id: alvo.id,
      tipo: alvo.tipo,
      valor: alvo.valor,
      ...(alvo.ultimaChave === undefined ? {} : { ultimaChave: alvo.ultimaChave }),
      falhasConsecutivas: alvo.falhasConsecutivas,
      assinantes: [...porTenant].map(([tenantId, referencias]) => ({ tenantId, referencias })),
    });
  }

  registrarSucesso(
    _tx: TransacaoEmMemoria,
    alvoId: Uuid,
    em: Instant,
    janela: JanelaDaCaptura,
    chave: string,
  ) {
    const alvo = this.alvos.get(alvoId);
    if (alvo !== undefined) {
      Object.assign(alvo, { ultimoSucesso: em, ultimaJanelaFim: janela.fim, ultimaChave: chave });
      alvo.falhasConsecutivas = 0;
      delete alvo.proximaExecucao;
    }
    return Promise.resolve();
  }

  registrarFalha(_tx: TransacaoEmMemoria, alvoId: Uuid, falhas: number, proxima: Instant) {
    const alvo = this.alvos.get(alvoId);
    if (alvo !== undefined)
      Object.assign(alvo, { falhasConsecutivas: falhas, proximaExecucao: proxima });
    return Promise.resolve();
  }
}
