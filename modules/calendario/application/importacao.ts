import { err, lerCsv, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { EventoGlobal } from '../domain/evento.js';

import { globalListado, lerConteudo, origemDe } from './calendario.js';

import type { AutorEmAcao, EventoGlobalListado } from './calendario.js';
import type { RepositorioDeEventosGlobais } from './portas.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, ProblemaValidacao, Result, UnidadeDeTrabalho } from '@pz/kernel';

/** Colunas do CSV, nesta ordem no cabeçalho; célula vazia é campo ausente. */
export const COLUNAS_DO_CSV = [
  'abrangencia',
  'uf',
  'municipioIbge',
  'tribunal',
  'comarca',
  'tipo',
  'inicio',
  'fim',
  'descricao',
  'atoNormativo',
  'urlAto',
] as const;
export const MAXIMO_DE_LINHAS = 1000;

export { lerCsv };

export const EntradaImportacao = z
  .object({
    csv: z.string().min(1).max(1_000_000),
    somentePrevia: z.boolean().default(true),
    /**
     * Pula a linha igual a um evento global já cadastrado e não revogado (mesmo local, tipo,
     * período e descrição): a carga da planilha pode rodar de novo sem duplicar.
     */
    ignorarRepetidos: z.boolean().default(false),
  })
  .strict();

/** O que torna dois eventos o mesmo evento da carga. */
const chaveDoEvento = (e: EventoGlobal['estado']) =>
  [
    e.abrangencia,
    e.uf ?? '',
    e.municipioIbge ?? '',
    e.tribunal ?? '',
    e.comarca ?? '',
    e.tipo,
    e.inicio.paraIso(),
    e.fim.paraIso(),
    e.descricao,
  ].join('|');

export interface LinhaDaPrevia {
  /** Número da linha no arquivo (o cabeçalho é a 1). */
  readonly linha: number;
  readonly problemas: readonly ProblemaValidacao[];
}

export interface ResultadoDaImportacao {
  readonly linhas: readonly LinhaDaPrevia[];
  /** Eventos gravados como rascunho; vazio na prévia ou se alguma linha tiver problema. */
  readonly propostos: readonly EventoGlobalListado[];
  /** Linhas puladas por já existirem (só com `ignorarRepetidos`). */
  readonly repetidos?: number;
}

/**
 * Importação do calendário global por CSV (HU13), com prévia. Tudo ou nada: só grava se todas as
 * linhas forem válidas, e cada evento nasce rascunho, à espera da aprovação de outro curador.
 */
export class ImportarCalendario<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly globais: RepositorioDeEventosGlobais<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    curador: AutorEmAcao,
    entrada: unknown,
  ): Promise<Result<ResultadoDaImportacao, Validacao>> {
    const dados = EntradaImportacao.safeParse(entrada);
    if (!dados.success) {
      return err(new Validacao([{ campo: 'csv', mensagem: 'Envie o CSV (até 1 MB).' }]));
    }
    const [cabecalho = [], ...corpo] = lerCsv(dados.data.csv);
    if (cabecalho.map((c) => c.trim()).join() !== COLUNAS_DO_CSV.join()) {
      return err(
        new Validacao([
          { campo: 'csv', mensagem: `Cabeçalho esperado: ${COLUNAS_DO_CSV.join(';')}` },
        ]),
      );
    }
    if (corpo.length === 0 || corpo.length > MAXIMO_DE_LINHAS) {
      return err(
        new Validacao([{ campo: 'csv', mensagem: `De 1 a ${String(MAXIMO_DE_LINHAS)} linhas.` }]),
      );
    }
    const linhas: LinhaDaPrevia[] = [];
    const eventos: EventoGlobal[] = [];
    corpo.forEach((celulas, indice) => {
      const registro = Object.fromEntries(
        COLUNAS_DO_CSV.flatMap((coluna, i) => {
          const valor = celulas[i]?.trim() ?? '';
          return valor === '' ? [] : [[coluna, valor]];
        }),
      );
      const conteudo = lerConteudo(registro);
      const proposta = conteudo.ok
        ? EventoGlobal.propor(conteudo.valor, curador, this.relogio)
        : conteudo;
      if (proposta.ok) eventos.push(proposta.valor);
      const colunasDemais = celulas.length > COLUNAS_DO_CSV.length;
      linhas.push({
        linha: indice + 2,
        problemas: [
          ...(proposta.ok ? [] : proposta.erro.problemas),
          ...(colunasDemais ? [{ campo: 'csv', mensagem: 'Colunas a mais na linha.' }] : []),
        ],
      });
    });
    if (dados.data.somentePrevia || linhas.some((l) => l.problemas.length > 0)) {
      return ok({ linhas, propostos: [] });
    }
    const propostos: EventoGlobalListado[] = [];
    let repetidos = 0;
    await this.unidade.executar(async (transacao) => {
      const existentes = dados.data.ignorarRepetidos
        ? new Set(
            (await this.globais.listar(transacao, {}))
              .filter((e) => e.estado.revogadoEm === undefined)
              .map((e) => chaveDoEvento(e.estado)),
          )
        : new Set<string>();
      for (const evento of eventos) {
        const chave = chaveDoEvento(evento.estado);
        if (existentes.has(chave)) {
          repetidos += 1;
          continue;
        }
        existentes.add(chave);
        await this.globais.inserir(transacao, evento);
        const depois = globalListado(evento.estado);
        propostos.push(depois);
        await this.trilha.registrar(
          transacao,
          {
            tipo: 'calendario.evento-proposto',
            entidade: 'evento_calendario',
            entidadeId: evento.id,
            depois,
          },
          origemDe(curador),
        );
      }
    });
    return ok({ linhas, propostos, ...(dados.data.ignorarRepetidos ? { repetidos } : {}) });
  }
}
