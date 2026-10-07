import { Conflito, err, LocalDate, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { diasNaoUteis } from '../domain/dias-nao-uteis.js';
import { ABRANGENCIAS, EventoGlobal, FeriadoLocal, TIPOS_DE_EVENTO } from '../domain/evento.js';
import { jurisdicaoDoProcesso } from '../domain/jurisdicao-do-processo.js';

import type {
  CacheDeDiasNaoUteis,
  FiltroDoCalendario,
  LocalizadorDeProcesso,
  RepositorioDeEventosGlobais,
  RepositorioDeFeriadosLocais,
} from './portas.js';
import type { DiaNaoUtil, Jurisdicao } from '../domain/dias-nao-uteis.js';
import type {
  Autor,
  ConteudoDoEvento,
  EstadoDoEventoGlobal,
  EstadoDoFeriadoLocal,
} from '../domain/evento.js';
import type { JurisdicaoResolvida } from '../domain/jurisdicao-do-processo.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Outbox, Proibido, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Maior período de uma consulta: o motor pede um prazo por vez, nunca décadas. */
export const MAXIMO_DIAS_POR_CONSULTA = 3 * 366;

const Data = z.string().transform((texto, contexto) => {
  const data = LocalDate.analisar(texto);
  if (data.ok) return data.valor;
  contexto.addIssue({ code: 'custom', message: 'Data inválida (AAAA-MM-DD).' });
  return z.NEVER;
});
// Normalizados na entrada para que a comparação de jurisdição seja exata.
const Uf = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'UF inválida.');
const MunicipioIbge = z.string().regex(/^\d{7}$/, 'Código IBGE do município com 7 dígitos.');
const Tribunal = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,20}$/, 'Sigla do tribunal inválida.');
const Comarca = z.string().trim().min(1).max(200);

export const EntradaDoEvento = z
  .object({
    abrangencia: z.enum(ABRANGENCIAS),
    uf: Uf.optional(),
    municipioIbge: MunicipioIbge.optional(),
    tribunal: Tribunal.optional(),
    comarca: Comarca.optional(),
    tipo: z.enum(TIPOS_DE_EVENTO),
    inicio: Data,
    fim: Data,
    descricao: z.string().trim().min(1).max(500),
    atoNormativo: z.string().trim().min(1).max(500),
    urlAto: z.url({ protocol: /^https$/ }).max(2000),
  })
  .strict();

export const EntradaRevogacao = z.object({ motivo: z.string().trim().min(10).max(1000) }).strict();

const EntradaJurisdicao = z
  .object({
    uf: Uf.optional(),
    municipioIbge: MunicipioIbge.optional(),
    tribunal: Tribunal.optional(),
    comarca: Comarca.optional(),
  })
  .strict();

function periodoValido(
  { inicio, fim }: { inicio: LocalDate; fim: LocalDate },
  contexto: z.RefinementCtx,
): void {
  if (fim.ehAntesDe(inicio)) {
    contexto.addIssue({ code: 'custom', path: ['fim'], message: 'O fim é anterior ao início.' });
  } else if (inicio.diasAte(fim) > MAXIMO_DIAS_POR_CONSULTA) {
    contexto.addIssue({ code: 'custom', path: ['fim'], message: 'Período longo demais.' });
  }
}

export const EntradaDiasNaoUteis = z
  .object({ jurisdicao: EntradaJurisdicao, inicio: Data, fim: Data })
  .strict()
  .superRefine(periodoValido);

/** Quem age, e por qual canal (vai para a trilha). */
export interface AutorEmAcao extends Autor {
  readonly canal: OrigemDaAuditoria['canal'];
}

function validacao(erro: z.ZodError): Validacao {
  return new Validacao(
    erro.issues.map((problema) => ({ campo: problema.path.join('.'), mensagem: problema.message })),
  );
}

/** Remove chaves `undefined` (exactOptionalPropertyTypes): ausente é diferente de vazio. */
function semIndefinidos<T extends object>(objeto: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

export function lerConteudo(entrada: unknown): Result<ConteudoDoEvento, Validacao> {
  const dados = EntradaDoEvento.safeParse(entrada);
  return dados.success ? ok(semIndefinidos(dados.data)) : err(validacao(dados.error));
}

/** Representação serializável (auditoria, listagem, API). */
export interface EventoListado {
  readonly id: Uuid;
  readonly abrangencia: string;
  readonly uf: string | null;
  readonly municipioIbge: string | null;
  readonly tribunal: string | null;
  readonly comarca: string | null;
  readonly tipo: string;
  readonly inicio: string;
  readonly fim: string;
  readonly descricao: string;
  readonly atoNormativo: string;
  readonly urlAto: string;
}

export interface EventoGlobalListado extends EventoListado {
  readonly status: string;
  readonly propostoPor: Uuid;
  readonly propostoEm: string;
  readonly aprovadoPor: Uuid | null;
  readonly aprovadoEm: string | null;
  readonly revogadoPor: Uuid | null;
  readonly revogadoEm: string | null;
  readonly motivoRevogacao: string | null;
}

export interface FeriadoLocalListado extends EventoListado {
  readonly cadastradoPor: Uuid;
  readonly cadastradoEm: string;
  readonly revogadoPor: Uuid | null;
  readonly revogadoEm: string | null;
}

function listado(e: EstadoDoEventoGlobal | EstadoDoFeriadoLocal): EventoListado {
  return {
    id: e.id,
    abrangencia: e.abrangencia,
    uf: e.uf ?? null,
    municipioIbge: e.municipioIbge ?? null,
    tribunal: e.tribunal ?? null,
    comarca: e.comarca ?? null,
    tipo: e.tipo,
    inicio: e.inicio.paraIso(),
    fim: e.fim.paraIso(),
    descricao: e.descricao,
    atoNormativo: e.atoNormativo,
    urlAto: e.urlAto,
  };
}

export function globalListado(e: EstadoDoEventoGlobal): EventoGlobalListado {
  return {
    ...listado(e),
    status: e.status,
    propostoPor: e.propostoPor,
    propostoEm: e.propostoEm.paraIso(),
    aprovadoPor: e.aprovadoPor ?? null,
    aprovadoEm: e.aprovadoEm?.paraIso() ?? null,
    revogadoPor: e.revogadoPor ?? null,
    revogadoEm: e.revogadoEm?.paraIso() ?? null,
    motivoRevogacao: e.motivoRevogacao ?? null,
  };
}

export function localListado(e: EstadoDoFeriadoLocal): FeriadoLocalListado {
  return {
    ...listado(e),
    cadastradoPor: e.cadastradoPor,
    cadastradoEm: e.cadastradoEm.paraIso(),
    revogadoPor: e.revogadoPor ?? null,
    revogadoEm: e.revogadoEm?.paraIso() ?? null,
  };
}

const naoEncontrado = () => new NaoEncontrado('evento-inexistente', 'Evento não encontrado.');
export const origemDe = (autor: AutorEmAcao) => ({
  canal: autor.canal,
  usuarioId: autor.usuarioId,
});

/**
 * Casos de uso do calendário global (HU13). Escrevem na tabela global pela transação do tenant
 * plataforma do curador (o chamador define o tenant da sessão), com auditoria e eventos na mesma
 * transação (ADR-004, ADR-006). Quem é curador é verificado na API (permissão, HU07).
 */
export class ProporEventoDoCalendario<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly globais: RepositorioDeEventosGlobais<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    curador: AutorEmAcao,
    entrada: unknown,
  ): Promise<Result<EventoGlobalListado, Validacao>> {
    const conteudo = lerConteudo(entrada);
    if (!conteudo.ok) return conteudo;
    const proposta = EventoGlobal.propor(conteudo.valor, curador, this.relogio);
    if (!proposta.ok) return proposta;
    const depois = globalListado(proposta.valor.estado);
    await this.unidade.executar(async (transacao) => {
      await this.globais.inserir(transacao, proposta.valor);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'calendario.evento-proposto',
          entidade: 'evento_calendario',
          entidadeId: depois.id,
          depois,
        },
        origemDe(curador),
      );
    });
    return ok(depois);
  }
}

export class AprovarEventoDoCalendario<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly globais: RepositorioDeEventosGlobais<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    curador: AutorEmAcao,
    id: Uuid,
  ): Promise<Result<EventoGlobalListado, NaoEncontrado | Proibido | Conflito>> {
    return this.unidade.executar(async (transacao) => {
      const evento = await this.globais.buscar(transacao, id);
      if (evento === undefined) return err(naoEncontrado());
      const antes = globalListado(evento.estado);
      const aprovacao = evento.aprovar(curador, this.relogio);
      if (!aprovacao.ok) return aprovacao;
      if (!(await this.globais.registrarAprovacao(transacao, evento))) {
        return err(new Conflito('evento-ja-aprovado', 'Este evento já foi aprovado.'));
      }
      const depois = globalListado(evento.estado);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'calendario.evento-aprovado',
          entidade: 'evento_calendario',
          entidadeId: id,
          antes,
          depois,
        },
        origemDe(curador),
      );
      await this.outbox.gravar(transacao, evento.retirarEventos());
      return ok(depois);
    });
  }
}

export class RevogarEventoDoCalendario<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly globais: RepositorioDeEventosGlobais<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    curador: AutorEmAcao,
    id: Uuid,
    entrada: unknown,
  ): Promise<Result<EventoGlobalListado, Validacao | NaoEncontrado | Conflito>> {
    const dados = EntradaRevogacao.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    return this.unidade.executar(async (transacao) => {
      const evento = await this.globais.buscar(transacao, id);
      if (evento === undefined) return err(naoEncontrado());
      const antes = globalListado(evento.estado);
      const revogacao = evento.revogar(curador, dados.data.motivo, this.relogio);
      if (!revogacao.ok) return revogacao;
      if (!(await this.globais.registrarRevogacao(transacao, evento))) {
        return err(new Conflito('evento-nao-vigente', 'Este evento já foi revogado.'));
      }
      const depois = globalListado(evento.estado);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'calendario.evento-revogado',
          entidade: 'evento_calendario',
          entidadeId: id,
          antes,
          depois,
        },
        origemDe(curador),
      );
      await this.outbox.gravar(transacao, evento.retirarEventos());
      return ok(depois);
    });
  }
}

/** Feriados locais (HU13): o advogado cadastra no próprio tenant (o da sessão, via RLS). */
export class CadastrarFeriadoLocal<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly locais: RepositorioDeFeriadosLocais<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    autor: AutorEmAcao,
    entrada: unknown,
  ): Promise<Result<FeriadoLocalListado, Validacao>> {
    const conteudo = lerConteudo(entrada);
    if (!conteudo.ok) return conteudo;
    const cadastro = FeriadoLocal.cadastrar(conteudo.valor, autor, this.relogio);
    if (!cadastro.ok) return cadastro;
    const feriado = cadastro.valor;
    const depois = localListado(feriado.estado);
    await this.unidade.executar(async (transacao) => {
      await this.locais.inserir(transacao, feriado);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'calendario.feriado-local-cadastrado',
          entidade: 'feriado_local',
          entidadeId: depois.id,
          depois,
        },
        origemDe(autor),
      );
      await this.outbox.gravar(transacao, feriado.retirarEventos());
    });
    return ok(depois);
  }
}

export class RevogarFeriadoLocal<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly locais: RepositorioDeFeriadosLocais<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    autor: AutorEmAcao,
    id: Uuid,
  ): Promise<Result<FeriadoLocalListado, NaoEncontrado | Conflito>> {
    return this.unidade.executar(async (transacao) => {
      // Outro tenant: o RLS esconde a linha, e a resposta é a mesma de inexistente.
      const feriado = await this.locais.buscar(transacao, id);
      if (feriado === undefined) return err(naoEncontrado());
      const antes = localListado(feriado.estado);
      const revogacao = feriado.revogar(autor, this.relogio);
      if (!revogacao.ok) return revogacao;
      if (!(await this.locais.registrarRevogacao(transacao, feriado))) {
        return err(new Conflito('feriado-ja-revogado', 'Este feriado já foi revogado.'));
      }
      const depois = localListado(feriado.estado);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'calendario.feriado-local-revogado',
          entidade: 'feriado_local',
          entidadeId: id,
          antes,
          depois,
        },
        origemDe(autor),
      );
      await this.outbox.gravar(transacao, feriado.retirarEventos());
      return ok(depois);
    });
  }
}

export class ConsultarCalendario<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly globais: RepositorioDeEventosGlobais<Transacao>,
    private readonly locais: RepositorioDeFeriadosLocais<Transacao>,
  ) {}

  async globaisListados(filtro: FiltroDoCalendario): Promise<EventoGlobalListado[]> {
    const eventos = await this.unidade.executar((tx) => this.globais.listar(tx, filtro));
    return eventos.map((evento) => globalListado(evento.estado));
  }

  async locaisListados(filtro: FiltroDoCalendario): Promise<FeriadoLocalListado[]> {
    const feriados = await this.unidade.executar((tx) => this.locais.listar(tx, filtro));
    return feriados.map((feriado) => localListado(feriado.estado));
  }
}

/** Sem cache: calcula sempre (testes e composições sem Redis). */
const SEM_CACHE: CacheDeDiasNaoUteis = {
  doAno: (_jurisdicao, _ano, calcular) => calcular(),
  invalidar: () => Promise.resolve(),
};

/**
 * Porta de consulta do motor (HU13): `diasNaoUteis(jurisdicao, periodo)`. Junta os globais
 * vigentes e os locais do tenant da transação. Só datas cadastradas, nunca calculadas (ADR-007).
 * Com cache, guarda o ano inteiro por (jurisdição, ano) e recorta o período pedido.
 */
export class ConsultarDiasNaoUteis<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly globais: RepositorioDeEventosGlobais<Transacao>,
    private readonly locais: RepositorioDeFeriadosLocais<Transacao>,
    private readonly cache: CacheDeDiasNaoUteis = SEM_CACHE,
  ) {}

  async executar(entrada: unknown): Promise<Result<DiaNaoUtil[], Validacao>> {
    const dados = EntradaDiasNaoUteis.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const { jurisdicao, inicio, fim } = dados.data;
    return ok(await this.diasNaoUteis(semIndefinidos(jurisdicao), inicio, fim));
  }

  async diasNaoUteis(
    jurisdicao: Jurisdicao,
    inicio: LocalDate,
    fim: LocalDate,
  ): Promise<DiaNaoUtil[]> {
    const dias: DiaNaoUtil[] = [];
    // Cada ano vem ordenado; concatenados em ordem, o resultado continua ordenado.
    for (let ano = inicio.ano; ano <= fim.ano; ano++) {
      const doAno = await this.cache.doAno(jurisdicao, ano, () =>
        this.calcular(jurisdicao, LocalDate.de(ano, 1, 1), LocalDate.de(ano, 12, 31)),
      );
      dias.push(...doAno.filter((d) => !d.data.ehAntesDe(inicio) && !d.data.ehDepoisDe(fim)));
    }
    return dias;
  }

  private async calcular(jurisdicao: Jurisdicao, inicio: LocalDate, fim: LocalDate) {
    const [globais, locais] = await this.unidade.executar(async (transacao) => [
      await this.globais.vigentesNoPeriodo(transacao, inicio, fim),
      await this.locais.vigentesNoPeriodo(transacao, inicio, fim),
    ]);
    // O repositório já filtra; a checagem aqui protege contra um adaptador que não filtre.
    const vigentes = [
      ...globais
        .filter((e) => e.vigente)
        .map((e) => ({ id: e.id, origem: 'global' as const, conteudo: e.estado })),
      ...locais
        .filter((e) => e.vigente)
        .map((e) => ({ id: e.id, origem: 'local' as const, conteudo: e.estado })),
    ];
    return diasNaoUteis(vigentes, jurisdicao, inicio, fim);
  }
}

export const EntradaDiasNaoUteisDoProcesso = z
  .object({ processoId: z.uuid(), inicio: Data, fim: Data })
  .strict()
  .superRefine(periodoValido);

export interface DiasNaoUteisDoProcesso extends JurisdicaoResolvida {
  readonly dias: DiaNaoUtil[];
}

/**
 * diasNaoUteis com a jurisdição resolvida a partir do processo (HU13): o motor e as telas pedem
 * pelo processo, sem repetir tribunal e comarca. As lacunas seguem junto para virar aviso.
 */
export class ConsultarDiasNaoUteisDoProcesso<Transacao> {
  constructor(
    private readonly localizar: LocalizadorDeProcesso,
    private readonly dias: ConsultarDiasNaoUteis<Transacao>,
  ) {}

  async executar(
    entrada: unknown,
  ): Promise<Result<DiasNaoUteisDoProcesso, Validacao | NaoEncontrado>> {
    const dados = EntradaDiasNaoUteisDoProcesso.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const { processoId, inicio, fim } = dados.data;
    const local = await this.localizar(processoId as Uuid);
    if (local === undefined)
      return err(new NaoEncontrado('processo-inexistente', 'Processo não encontrado.'));
    const resolvida = jurisdicaoDoProcesso(local);
    return ok({
      ...resolvida,
      dias: await this.dias.diasNaoUteis(resolvida.jurisdicao, inicio, fim),
    });
  }
}

const AlteracaoRecebida = z.object({
  tenantId: z.uuid(),
  payload: z.object({ origem: z.enum(['global', 'local']), inicio: Data, fim: Data }),
});

/**
 * Invalida o cache dos anos alcançados por um CalendarioAlterado (HU13). Repetir é inofensivo:
 * só força uma nova leitura do banco. Falha lança, para o job tentar de novo e ir à DLQ.
 */
export class InvalidarCacheDoCalendario {
  constructor(private readonly cache: CacheDeDiasNaoUteis) {}

  async executar(evento: unknown): Promise<void> {
    const { tenantId, payload } = AlteracaoRecebida.parse(evento);
    const anos: number[] = [];
    for (let ano = payload.inicio.ano; ano <= payload.fim.ano; ano++) anos.push(ano);
    await this.cache.invalidar({ origem: payload.origem, tenantId: tenantId as Uuid, anos });
  }
}
