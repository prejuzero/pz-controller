import { AggregateRoot, Conflito, err, gerarUuidV7, ok, Proibido, Validacao } from '@pz/kernel';

import type {
  Clock,
  EventoDominio,
  Instant,
  LocalDate,
  ProblemaValidacao,
  Result,
  Uuid,
} from '@pz/kernel';

/** Níveis do calendário (HU13): do país inteiro à comarca de um tribunal. */
export const ABRANGENCIAS = ['nacional', 'uf', 'municipio', 'tribunal', 'comarca'] as const;
export type Abrangencia = (typeof ABRANGENCIAS)[number];

/** Por que o dia não conta (CPC, arts. 216, 220 e 224, §1º; Lei 11.419, art. 10, §2º). */
export const TIPOS_DE_EVENTO = ['feriado', 'recesso', 'portaria', 'indisponibilidade'] as const;
export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number];

/** Onde o evento vale. Os campos exigidos dependem da abrangência (ver `validarConteudo`). */
export interface LocalDoEvento {
  readonly abrangencia: Abrangencia;
  readonly uf?: string;
  readonly municipioIbge?: string;
  readonly tribunal?: string;
  readonly comarca?: string;
}

/** Conteúdo jurídico de um evento: vem do curador ou do escritório, nunca do código ou da IA. */
export interface ConteudoDoEvento extends LocalDoEvento {
  readonly tipo: TipoDeEvento;
  /** Período inclusivo nas duas pontas. */
  readonly inicio: LocalDate;
  readonly fim: LocalDate;
  readonly descricao: string;
  /** Ato normativo exato (lei, resolução ou portaria, com artigo quando houver). */
  readonly atoNormativo: string;
  /** Link HTTPS para a fonte oficial. */
  readonly urlAto: string;
}

/** Quem age: o curador (tenant plataforma) nos globais; o advogado no próprio escritório. */
export interface Autor {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
}

export type OrigemDoEvento = 'global' | 'local';

/** O calendário de uma jurisdição mudou: o motor recalcula e o cache é invalidado. */
export type CalendarioAlterado = EventoDominio<
  'CalendarioAlterado',
  {
    eventoId: string;
    origem: OrigemDoEvento;
    acao: 'incluido' | 'revogado';
    abrangencia: Abrangencia;
    uf?: string;
    municipioIbge?: string;
    tribunal?: string;
    comarca?: string;
    inicio: string;
    fim: string;
    usuarioId: string;
  }
>;

const CAMPOS_POR_ABRANGENCIA: Readonly<
  Record<Abrangencia, readonly (keyof Omit<LocalDoEvento, 'abrangencia'>)[]>
> = {
  nacional: [],
  uf: ['uf'],
  municipio: ['uf', 'municipioIbge'],
  tribunal: ['tribunal'],
  comarca: ['tribunal', 'comarca'],
};
const CAMPOS_DE_LOCAL = ['uf', 'municipioIbge', 'tribunal', 'comarca'] as const;

/** Invariantes do conteúdo; o fundamento legal em si é responsabilidade de quem cadastra. */
export function validarConteudo(conteudo: ConteudoDoEvento): ProblemaValidacao[] {
  const problemas: ProblemaValidacao[] = [];
  const exigidos = CAMPOS_POR_ABRANGENCIA[conteudo.abrangencia];
  for (const campo of CAMPOS_DE_LOCAL) {
    const preenchido = (conteudo[campo]?.trim() ?? '') !== '';
    if (exigidos.includes(campo) && !preenchido) {
      problemas.push({ campo, mensagem: `Obrigatório na abrangência ${conteudo.abrangencia}.` });
    }
    if (!exigidos.includes(campo) && conteudo[campo] !== undefined) {
      problemas.push({ campo, mensagem: `Não se aplica à abrangência ${conteudo.abrangencia}.` });
    }
  }
  if (conteudo.fim.ehAntesDe(conteudo.inicio)) {
    problemas.push({ campo: 'fim', mensagem: 'O fim é anterior ao início.' });
  }
  if (conteudo.descricao.trim().length === 0) {
    problemas.push({ campo: 'descricao', mensagem: 'Informe a descrição.' });
  }
  if (conteudo.atoNormativo.trim().length === 0) {
    problemas.push({ campo: 'atoNormativo', mensagem: 'Informe o ato normativo.' });
  }
  if (!/^https:\/\/\S+$/.test(conteudo.urlAto)) {
    problemas.push({ campo: 'urlAto', mensagem: 'Informe o link HTTPS da fonte oficial.' });
  }
  return problemas;
}

function alterado(
  relogio: Clock,
  agora: Instant,
  autor: Autor,
  eventoId: Uuid,
  origem: OrigemDoEvento,
  acao: 'incluido' | 'revogado',
  conteudo: ConteudoDoEvento,
): CalendarioAlterado {
  return {
    id: gerarUuidV7(relogio),
    tipo: 'CalendarioAlterado',
    versao: 1,
    tenantId: autor.tenantId,
    agregadoId: eventoId,
    ocorridoEm: agora,
    payload: {
      eventoId,
      origem,
      acao,
      abrangencia: conteudo.abrangencia,
      ...(conteudo.uf === undefined ? {} : { uf: conteudo.uf }),
      ...(conteudo.municipioIbge === undefined ? {} : { municipioIbge: conteudo.municipioIbge }),
      ...(conteudo.tribunal === undefined ? {} : { tribunal: conteudo.tribunal }),
      ...(conteudo.comarca === undefined ? {} : { comarca: conteudo.comarca }),
      inicio: conteudo.inicio.paraIso(),
      fim: conteudo.fim.paraIso(),
      usuarioId: autor.usuarioId,
    },
  };
}

export type StatusDoEvento = 'rascunho' | 'aprovado';

export interface EstadoDoEventoGlobal extends ConteudoDoEvento {
  readonly id: Uuid;
  readonly status: StatusDoEvento;
  readonly propostoPor: Uuid;
  readonly propostoEm: Instant;
  readonly aprovadoPor?: Uuid;
  readonly aprovadoEm?: Instant;
  readonly revogadoPor?: Uuid;
  readonly revogadoEm?: Instant;
  readonly motivoRevogacao?: string;
}

/**
 * Evento do calendário global (HU13): nasce rascunho e só vale depois de aprovado por outra
 * pessoa (quatro olhos, CLAUDE.md, seção 4.3). Incluir um dia não útil adia prazos, por isso
 * exige a segunda pessoa; revogar só antecipa (na dúvida, a data mais cedo, seção 4.4) e fica a
 * cargo de um curador, com motivo.
 */
export class EventoGlobal extends AggregateRoot<CalendarioAlterado> {
  #estado: EstadoDoEventoGlobal;

  private constructor(estado: EstadoDoEventoGlobal) {
    super(estado.id);
    this.#estado = estado;
  }

  static propor(
    conteudo: ConteudoDoEvento,
    proponente: Autor,
    relogio: Clock,
  ): Result<EventoGlobal, Validacao> {
    const problemas = validarConteudo(conteudo);
    if (problemas.length > 0) return err(new Validacao(problemas));
    return ok(
      new EventoGlobal({
        ...conteudo,
        id: gerarUuidV7(relogio),
        status: 'rascunho',
        propostoPor: proponente.usuarioId,
        propostoEm: relogio.agora(),
      }),
    );
  }

  static restaurar(estado: EstadoDoEventoGlobal): EventoGlobal {
    return new EventoGlobal(estado);
  }

  get estado(): EstadoDoEventoGlobal {
    return this.#estado;
  }

  /** Aprovado e não revogado: é o que entra no cálculo. */
  get vigente(): boolean {
    return this.#estado.status === 'aprovado' && this.#estado.revogadoEm === undefined;
  }

  aprovar(aprovador: Autor, relogio: Clock): Result<void, Proibido | Conflito> {
    if (this.#estado.status === 'aprovado') {
      return err(new Conflito('evento-ja-aprovado', 'Este evento já foi aprovado.'));
    }
    if (aprovador.usuarioId === this.#estado.propostoPor) {
      return err(
        new Proibido('aprovacao-pelo-proponente', 'A aprovação exige outra pessoa (quatro olhos).'),
      );
    }
    const agora = relogio.agora();
    this.#estado = {
      ...this.#estado,
      status: 'aprovado',
      aprovadoPor: aprovador.usuarioId,
      aprovadoEm: agora,
    };
    this.registrarEvento(
      alterado(relogio, agora, aprovador, this.id, 'global', 'incluido', this.#estado),
    );
    return ok(undefined);
  }

  revogar(curador: Autor, motivo: string, relogio: Clock): Result<void, Validacao | Conflito> {
    if (motivo.trim().length < 10) {
      return err(new Validacao([{ campo: 'motivo', mensagem: 'Explique o motivo (mín. 10).' }]));
    }
    if (!this.vigente) {
      return err(new Conflito('evento-nao-vigente', 'Só um evento aprovado e vigente é revogado.'));
    }
    const agora = relogio.agora();
    this.#estado = {
      ...this.#estado,
      revogadoPor: curador.usuarioId,
      revogadoEm: agora,
      motivoRevogacao: motivo.trim(),
    };
    this.registrarEvento(
      alterado(relogio, agora, curador, this.id, 'global', 'revogado', this.#estado),
    );
    return ok(undefined);
  }
}

export interface EstadoDoFeriadoLocal extends ConteudoDoEvento {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly cadastradoPor: Uuid;
  readonly cadastradoEm: Instant;
  readonly revogadoPor?: Uuid;
  readonly revogadoEm?: Instant;
}

/**
 * Feriado ou suspensão cadastrado pelo próprio escritório (HU13), com o ato normativo. Vale só
 * no tenant dele. O calendário nacional é só do curador.
 */
export class FeriadoLocal extends AggregateRoot<CalendarioAlterado> {
  #estado: EstadoDoFeriadoLocal;

  private constructor(estado: EstadoDoFeriadoLocal) {
    super(estado.id);
    this.#estado = estado;
  }

  static cadastrar(
    conteudo: ConteudoDoEvento,
    autor: Autor,
    relogio: Clock,
  ): Result<FeriadoLocal, Validacao> {
    const problemas = validarConteudo(conteudo);
    if (conteudo.abrangencia === 'nacional') {
      problemas.push({
        campo: 'abrangencia',
        mensagem: 'O calendário nacional é mantido pelo PrejuZero.',
      });
    }
    if (problemas.length > 0) return err(new Validacao(problemas));
    const agora = relogio.agora();
    const feriado = new FeriadoLocal({
      ...conteudo,
      id: gerarUuidV7(relogio),
      tenantId: autor.tenantId,
      cadastradoPor: autor.usuarioId,
      cadastradoEm: agora,
    });
    feriado.registrarEvento(
      alterado(relogio, agora, autor, feriado.id, 'local', 'incluido', conteudo),
    );
    return ok(feriado);
  }

  static restaurar(estado: EstadoDoFeriadoLocal): FeriadoLocal {
    return new FeriadoLocal(estado);
  }

  get estado(): EstadoDoFeriadoLocal {
    return this.#estado;
  }

  get vigente(): boolean {
    return this.#estado.revogadoEm === undefined;
  }

  revogar(autor: Autor, relogio: Clock): Result<void, Conflito> {
    if (!this.vigente) {
      return err(new Conflito('feriado-ja-revogado', 'Este feriado já foi revogado.'));
    }
    const agora = relogio.agora();
    this.#estado = { ...this.#estado, revogadoPor: autor.usuarioId, revogadoEm: agora };
    this.registrarEvento(
      alterado(relogio, agora, autor, this.id, 'local', 'revogado', this.#estado),
    );
    return ok(undefined);
  }
}
