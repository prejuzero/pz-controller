import {
  AggregateRoot,
  Conflito,
  err,
  gerarUuidV7,
  NaoEncontrado,
  ok,
  RegraDeNegocio,
} from '@pz/kernel';

import type { Celular, Cpf, NumeroOab, Uf } from './valores.js';
import type { Clock, EventoDominio, Instant, Result, Uuid } from '@pz/kernel';

export type TipoOab = 'principal' | 'suplementar';

export interface Oab {
  readonly id: Uuid;
  readonly numero: string;
  readonly uf: Uf;
  readonly tipo: TipoOab;
  readonly ativa: boolean;
  readonly removidaEm?: Instant;
}

export interface EstadoDoAdvogado {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly nome: string;
  readonly cpf: string;
  readonly celular: string;
  readonly emailsAdicionais: readonly string[];
  readonly oabs: readonly Oab[];
}

export type AdvogadoCadastrado = EventoDominio<
  'AdvogadoCadastrado',
  { advogadoId: Uuid; usuarioId: Uuid }
>;
/** Cada OAB adicionada entra no monitoramento (HU11); a captura consome este evento. */
export type OabAdicionada = EventoDominio<
  'OabAdicionada',
  { advogadoId: Uuid; oabId: Uuid; numero: string; uf: Uf; tipo: TipoOab }
>;
export type OabRemovida = EventoDominio<
  'OabRemovida',
  { advogadoId: Uuid; oabId: Uuid; numero: string; uf: Uf }
>;
export type EventoDoCadastro = AdvogadoCadastrado | OabAdicionada | OabRemovida;
type SemEnvelope<E> = E extends EventoDoCadastro ? Pick<E, 'tipo' | 'payload'> : never;

/** Quantas inscrições suplementares um advogado pode ter (uma por seccional além da principal). */
export const MAXIMO_DE_OABS = 27;
export const MAXIMO_DE_EMAILS_ADICIONAIS = 5;

export interface DadosDoCadastro {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly nome: string;
  readonly cpf: Cpf;
  readonly celular: Celular;
  readonly emailsAdicionais: readonly string[];
  readonly oabPrincipal: { readonly numero: NumeroOab; readonly uf: Uf };
  readonly oabsSuplementares: readonly { readonly numero: NumeroOab; readonly uf: Uf }[];
}

/** Advogado do tenant e suas inscrições na OAB (HU11, RF01 e RF02). */
export class Advogado extends AggregateRoot<EventoDoCadastro> {
  private constructor(
    private estadoAtual: EstadoDoAdvogado,
    private readonly relogio: Clock,
  ) {
    super(estadoAtual.id);
  }

  get estado(): EstadoDoAdvogado {
    return this.estadoAtual;
  }

  static restaurar(estado: EstadoDoAdvogado, relogio: Clock): Advogado {
    return new Advogado(estado, relogio);
  }

  static cadastrar(
    dados: DadosDoCadastro,
    relogio: Clock,
  ): Result<Advogado, RegraDeNegocio | Conflito> {
    const advogado = new Advogado(
      {
        id: gerarUuidV7(relogio),
        tenantId: dados.tenantId,
        usuarioId: dados.usuarioId,
        nome: dados.nome,
        cpf: dados.cpf.valor,
        celular: dados.celular.valor,
        emailsAdicionais: dados.emailsAdicionais,
        oabs: [],
      },
      relogio,
    );
    advogado.emitir({
      tipo: 'AdvogadoCadastrado',
      payload: { advogadoId: advogado.id, usuarioId: dados.usuarioId },
    });
    const inscricoes = [
      { ...dados.oabPrincipal, tipo: 'principal' as const },
      ...dados.oabsSuplementares.map((oab) => ({ ...oab, tipo: 'suplementar' as const })),
    ];
    for (const inscricao of inscricoes) {
      const adicionada = advogado.incluirOab(inscricao.numero, inscricao.uf, inscricao.tipo);
      if (!adicionada.ok) return err(adicionada.erro);
    }
    return ok(advogado);
  }

  /** Nova inscrição suplementar: entra no monitoramento pelo evento OabAdicionada. */
  adicionarOab(numero: NumeroOab, uf: Uf): Result<Oab, RegraDeNegocio | Conflito> {
    return this.incluirOab(numero, uf, 'suplementar');
  }

  /** A principal não sai: o monitoramento precisa de pelo menos uma inscrição. */
  removerOab(oabId: Uuid): Result<Oab, NaoEncontrado | RegraDeNegocio> {
    const oab = this.ativas().find((item) => item.id === oabId);
    if (oab === undefined)
      return err(new NaoEncontrado('oab-nao-encontrada', 'OAB não encontrada.'));
    if (oab.tipo === 'principal')
      return err(new RegraDeNegocio('oab-principal', 'A OAB principal não pode ser removida.'));
    const removida: Oab = { ...oab, ativa: false, removidaEm: this.agora() };
    this.estadoAtual = {
      ...this.estadoAtual,
      oabs: this.estadoAtual.oabs.map((item) => (item.id === oabId ? removida : item)),
    };
    this.emitir({
      tipo: 'OabRemovida',
      payload: {
        advogadoId: this.id,
        oabId,
        numero: oab.numero,
        uf: oab.uf,
      },
    });
    return ok(removida);
  }

  atualizarPerfil(
    alteracao: Partial<Pick<EstadoDoAdvogado, 'nome' | 'emailsAdicionais'>> & {
      readonly celular?: Celular;
    },
  ): void {
    this.estadoAtual = {
      ...this.estadoAtual,
      ...(alteracao.nome === undefined ? {} : { nome: alteracao.nome }),
      ...(alteracao.celular === undefined ? {} : { celular: alteracao.celular.valor }),
      ...(alteracao.emailsAdicionais === undefined
        ? {}
        : { emailsAdicionais: alteracao.emailsAdicionais }),
    };
  }

  private ativas(): Oab[] {
    return this.estadoAtual.oabs.filter((oab) => oab.ativa);
  }

  private incluirOab(
    numero: NumeroOab,
    uf: Uf,
    tipo: TipoOab,
  ): Result<Oab, RegraDeNegocio | Conflito> {
    const ativas = this.ativas();
    if (ativas.some((oab) => oab.numero === numero.valor && oab.uf === uf))
      return err(new Conflito('oab-repetida', 'Esta OAB já está no seu cadastro.'));
    if (ativas.length >= MAXIMO_DE_OABS)
      return err(new RegraDeNegocio('limite-de-oabs', 'Limite de inscrições atingido.'));
    const oab: Oab = { id: gerarUuidV7(this.relogio), numero: numero.valor, uf, tipo, ativa: true };
    this.estadoAtual = { ...this.estadoAtual, oabs: [...this.estadoAtual.oabs, oab] };
    this.emitir({
      tipo: 'OabAdicionada',
      payload: {
        advogadoId: this.id,
        oabId: oab.id,
        numero: oab.numero,
        uf,
        tipo,
      },
    });
    return ok(oab);
  }

  private agora(): Instant {
    return this.relogio.agora();
  }

  private emitir(evento: SemEnvelope<EventoDoCadastro>): void {
    this.registrarEvento({
      id: gerarUuidV7(this.relogio),
      versao: 1,
      tenantId: this.estadoAtual.tenantId,
      agregadoId: this.id,
      ocorridoEm: this.agora(),
      ...evento,
    });
  }
}
