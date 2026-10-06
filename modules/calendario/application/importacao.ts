import { err, ok, Validacao } from '@pz/kernel';
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
const BOM = String.fromCharCode(0xfeff);

export const EntradaImportacao = z
  .object({
    csv: z.string().min(1).max(1_000_000),
    somentePrevia: z.boolean().default(true),
  })
  .strict();

/** CSV no padrão RFC 4180 com separador `;` (Excel em pt-BR) ou `,`, detectado no cabeçalho. */
export function lerCsv(texto: string): string[][] {
  const semBom = texto.startsWith(BOM) ? texto.slice(1) : texto;
  const primeiraLinha = semBom.split(/\r?\n/, 1)[0] ?? '';
  const separador = primeiraLinha.includes(';') ? ';' : ',';
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = '';
  let entreAspas = false;
  for (let i = 0; i < semBom.length; i++) {
    const c = semBom.charAt(i);
    if (entreAspas) {
      if (c === '"' && semBom.charAt(i + 1) === '"') {
        celula += '"';
        i++;
      } else if (c === '"') entreAspas = false;
      else celula += c;
    } else if (c === '"') entreAspas = true;
    else if (c === separador) {
      linha.push(celula);
      celula = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && semBom.charAt(i + 1) === '\n') i++;
      linhas.push([...linha, celula]);
      linha = [];
      celula = '';
    } else celula += c;
  }
  if (celula !== '' || linha.length > 0) linhas.push([...linha, celula]);
  return linhas.filter((l) => l.some((valor) => valor.trim() !== ''));
}

export interface LinhaDaPrevia {
  /** Número da linha no arquivo (o cabeçalho é a 1). */
  readonly linha: number;
  readonly problemas: readonly ProblemaValidacao[];
}

export interface ResultadoDaImportacao {
  readonly linhas: readonly LinhaDaPrevia[];
  /** Eventos gravados como rascunho; vazio na prévia ou se alguma linha tiver problema. */
  readonly propostos: readonly EventoGlobalListado[];
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
    const propostos = eventos.map((evento) => globalListado(evento.estado));
    await this.unidade.executar(async (transacao) => {
      for (const [i, evento] of eventos.entries()) {
        await this.globais.inserir(transacao, evento);
        const depois = propostos[i];
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
    return ok({ linhas, propostos });
  }
}
