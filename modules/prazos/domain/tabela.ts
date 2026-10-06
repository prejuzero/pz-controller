import { AggregateRoot, Conflito, gerarUuidV7, ok, err, Proibido, Validacao } from '@pz/kernel';

import type {
  Clock,
  EventoDominio,
  Instant,
  LocalDate,
  ProblemaValidacao,
  Result,
  Uuid,
} from '@pz/kernel';

/** Ramos com contagem própria (CLAUDE.md, seção 4.5); a contagem em si é do motor. */
export const RAMOS = ['civel', 'juizados', 'trabalhista', 'penal'] as const;
export type Ramo = (typeof RAMOS)[number];

/** Unidade do prazo; fora de `dias`, só há cálculo com regra específica (CLAUDE.md, seção 4.4). */
export const UNIDADES = ['dias', 'horas', 'meses', 'anos'] as const;
export type Unidade = (typeof UNIDADES)[number];

export type StatusDaVersao = 'rascunho' | 'aprovado';

/** Quem mantém a tabela: usuário do tenant plataforma (a trilha e os eventos ficam nele). */
export interface Curador {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
}

/** Conteúdo jurídico de uma versão: vem do curador, nunca do código ou da IA (seção 4.6). */
export interface ConteudoDaVersao {
  readonly tipoAto: string;
  readonly ramo: Ramo;
  readonly dias: number;
  readonly unidade: Unidade;
  /** Dispositivo exato (lei ou ato, artigo, parágrafo, inciso). */
  readonly fundamento: string;
  /** Link para a fonte oficial. */
  readonly fonteUrl: string;
  readonly vigenciaInicio: LocalDate;
  readonly vigenciaFim?: LocalDate;
}

export interface EstadoDaVersao extends ConteudoDaVersao {
  readonly id: Uuid;
  readonly versao: number;
  readonly status: StatusDaVersao;
  readonly propostoPor: Uuid;
  readonly propostoEm: Instant;
  readonly aprovadoPor?: Uuid;
  readonly aprovadoEm?: Instant;
}

export type TabelaPrazoAprovada = EventoDominio<
  'TabelaPrazoAprovada',
  {
    versaoId: string;
    tipoAto: string;
    ramo: string;
    versao: string;
    vigenciaInicio: string;
    usuarioId: string;
  }
>;

const CODIGO_DE_ATO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Invariantes do conteúdo; o fundamento legal em si é responsabilidade do curador. */
export function validarConteudo(conteudo: ConteudoDaVersao): ProblemaValidacao[] {
  const problemas: ProblemaValidacao[] = [];
  if (!CODIGO_DE_ATO.test(conteudo.tipoAto)) {
    problemas.push({ campo: 'tipoAto', mensagem: 'Código de ato inválido.' });
  }
  if (!Number.isInteger(conteudo.dias) || conteudo.dias <= 0) {
    problemas.push({ campo: 'dias', mensagem: 'Informe um número inteiro positivo.' });
  }
  if (conteudo.fundamento.trim().length === 0) {
    problemas.push({ campo: 'fundamento', mensagem: 'Informe o dispositivo legal.' });
  }
  if (!/^https:\/\/\S+$/.test(conteudo.fonteUrl)) {
    problemas.push({ campo: 'fonteUrl', mensagem: 'Informe o link HTTPS da fonte oficial.' });
  }
  if (conteudo.vigenciaFim?.ehAntesDe(conteudo.vigenciaInicio) === true) {
    problemas.push({ campo: 'vigenciaFim', mensagem: 'O fim da vigência é anterior ao início.' });
  }
  return problemas;
}

/**
 * Versão da tabela de prazos (HU15, ADR-007): nasce rascunho e só vale depois de aprovada por
 * outra pessoa. Aprovada, nunca muda; alteração é nova versão.
 */
export class VersaoDaTabela extends AggregateRoot<TabelaPrazoAprovada> {
  #estado: EstadoDaVersao;

  private constructor(estado: EstadoDaVersao) {
    super(estado.id);
    this.#estado = estado;
  }

  static propor(
    conteudo: ConteudoDaVersao,
    versao: number,
    proponente: Curador,
    relogio: Clock,
  ): Result<VersaoDaTabela, Validacao> {
    const problemas = validarConteudo(conteudo);
    if (problemas.length > 0) return err(new Validacao(problemas));
    return ok(
      new VersaoDaTabela({
        ...conteudo,
        fundamento: conteudo.fundamento.trim(),
        id: gerarUuidV7(relogio),
        versao,
        status: 'rascunho',
        propostoPor: proponente.usuarioId,
        propostoEm: relogio.agora(),
      }),
    );
  }

  static restaurar(estado: EstadoDaVersao): VersaoDaTabela {
    return new VersaoDaTabela(estado);
  }

  get estado(): EstadoDaVersao {
    return this.#estado;
  }

  /** Quatro olhos: quem propôs não aprova. */
  aprovar(aprovador: Curador, relogio: Clock): Result<void, Proibido | Conflito> {
    if (this.#estado.status === 'aprovado') {
      return err(new Conflito('versao-ja-aprovada', 'Esta versão já foi aprovada.'));
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
    this.registrarEvento({
      id: gerarUuidV7(relogio),
      tipo: 'TabelaPrazoAprovada',
      versao: 1,
      tenantId: aprovador.tenantId,
      agregadoId: this.id,
      ocorridoEm: agora,
      payload: {
        versaoId: this.id,
        tipoAto: this.#estado.tipoAto,
        ramo: this.#estado.ramo,
        versao: String(this.#estado.versao),
        vigenciaInicio: this.#estado.vigenciaInicio.paraIso(),
        usuarioId: aprovador.usuarioId,
      },
    });
    return ok(undefined);
  }

  /** Vigência inclusiva nas duas pontas. */
  vigeEm(data: LocalDate): boolean {
    const { vigenciaInicio, vigenciaFim } = this.#estado;
    return (
      !data.ehAntesDe(vigenciaInicio) &&
      (vigenciaFim === undefined || !data.ehDepoisDe(vigenciaFim))
    );
  }
}

/**
 * Versão aplicável na data do ato (CPC, art. 14: a norma vigente na data do ato): entre as
 * aprovadas vigentes, a de início de vigência mais recente; no mesmo início, a versão mais nova
 * (correção posterior do curador).
 */
export function selecionarVigente(
  versoes: readonly VersaoDaTabela[],
  dataDoAto: LocalDate,
): VersaoDaTabela | undefined {
  let escolhida: VersaoDaTabela | undefined;
  for (const candidata of versoes) {
    if (candidata.estado.status !== 'aprovado' || !candidata.vigeEm(dataDoAto)) continue;
    if (escolhida === undefined) {
      escolhida = candidata;
      continue;
    }
    const inicio = candidata.estado.vigenciaInicio.comparar(escolhida.estado.vigenciaInicio);
    if (inicio > 0 || (inicio === 0 && candidata.estado.versao > escolhida.estado.versao)) {
      escolhida = candidata;
    }
  }
  return escolhida;
}
