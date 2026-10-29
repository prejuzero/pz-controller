import { err, lerCsv, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { validarConteudo, VersaoDaTabela } from '../domain/tabela.js';

import { EntradaProposta, listada, montarConteudo } from './tabela-de-prazos.js';

import type { RepositorioDaTabela, RepositorioDeTiposDeAto, TipoDeAto } from './portas.js';
import type { CuradorEmAcao, VersaoListada } from './tabela-de-prazos.js';
import type { ConteudoDaVersao } from '../domain/tabela.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, ProblemaValidacao, Result, UnidadeDeTrabalho } from '@pz/kernel';

/** Colunas do CSV, nesta ordem no cabeçalho; célula vazia é campo ausente. */
export const COLUNAS_DA_TABELA = [
  'tipoAto',
  'nomeDoAto',
  'ramo',
  'dias',
  'unidade',
  'contagem',
  'politicaDobro',
  'calculo',
  'marcoInicial',
  'localDoAto',
  'alerta',
  'fundamento',
  'fonteUrl',
  'vigenciaInicio',
  'vigenciaFim',
] as const;
export const MAXIMO_DE_LINHAS_DA_TABELA = 1000;

export const EntradaImportacaoDaTabela = z
  .object({
    csv: z.string().min(1).max(1_000_000),
    somentePrevia: z.boolean().default(true),
  })
  .strict();

export interface LinhaDaPreviaDaTabela {
  /** Número da linha no arquivo (o cabeçalho é a 1). */
  readonly linha: number;
  readonly problemas: readonly ProblemaValidacao[];
}

export interface ResultadoDaImportacaoDaTabela {
  readonly linhas: readonly LinhaDaPreviaDaTabela[];
  /** Tipos de ato que a importação cadastrou (ou cadastraria, na prévia). */
  readonly tiposNovos: readonly string[];
  /** Versões gravadas como rascunho; vazio na prévia ou se alguma linha tiver problema. */
  readonly propostos: readonly VersaoListada[];
}

interface LinhaLida {
  readonly numero: number;
  readonly nomeDoAto?: string;
  readonly conteudo: ConteudoDaVersao;
}

/**
 * Importação da tabela de prazos por CSV (HU15), com prévia, no padrão da importação do
 * calendário (HU13). Tudo ou nada: só grava se todas as linhas forem válidas. Cadastra os tipos de
 * ato que faltam e propõe cada linha como rascunho; a aprovação continua uma a uma, por outro
 * curador (quatro olhos).
 */
export class ImportarTabelaDePrazos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly tipos: RepositorioDeTiposDeAto<Transacao>,
    private readonly tabela: RepositorioDaTabela<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    curador: CuradorEmAcao,
    entrada: unknown,
  ): Promise<Result<ResultadoDaImportacaoDaTabela, Validacao>> {
    const dados = EntradaImportacaoDaTabela.safeParse(entrada);
    if (!dados.success) {
      return err(new Validacao([{ campo: 'csv', mensagem: 'Envie o CSV (até 1 MB).' }]));
    }
    const [cabecalho = [], ...corpo] = lerCsv(dados.data.csv);
    if (cabecalho.map((c) => c.trim()).join() !== COLUNAS_DA_TABELA.join()) {
      return err(
        new Validacao([
          { campo: 'csv', mensagem: `Cabeçalho esperado: ${COLUNAS_DA_TABELA.join(';')}` },
        ]),
      );
    }
    if (corpo.length === 0 || corpo.length > MAXIMO_DE_LINHAS_DA_TABELA) {
      return err(
        new Validacao([
          { campo: 'csv', mensagem: `De 1 a ${String(MAXIMO_DE_LINHAS_DA_TABELA)} linhas.` },
        ]),
      );
    }

    const problemas = new Map<number, ProblemaValidacao[]>();
    const lidas: LinhaLida[] = [];
    const vistas = new Set<string>();
    corpo.forEach((celulas, indice) => {
      const numero = indice + 2;
      const daLinha: ProblemaValidacao[] = [];
      problemas.set(numero, daLinha);
      const registro: Record<string, string> = Object.fromEntries(
        COLUNAS_DA_TABELA.flatMap((coluna, i) => {
          const valor = celulas[i]?.trim() ?? '';
          return valor === '' ? [] : [[coluna, valor]];
        }),
      );
      const { nomeDoAto, dias, ...resto } = registro;
      if (celulas.length > COLUNAS_DA_TABELA.length) {
        daLinha.push({ campo: 'csv', mensagem: 'Colunas a mais na linha.' });
      }
      const proposta = EntradaProposta.safeParse({
        ...resto,
        ...(dias === undefined ? {} : { dias: Number(dias) }),
      });
      if (!proposta.success) {
        daLinha.push(
          ...proposta.error.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })),
        );
        return;
      }
      const conteudo = montarConteudo(proposta.data);
      daLinha.push(...validarConteudo(conteudo));
      const chave = `${conteudo.tipoAto}|${conteudo.ramo}`;
      if (vistas.has(chave)) {
        daLinha.push({ campo: 'tipoAto', mensagem: 'Ato e ramo repetidos no arquivo.' });
      }
      vistas.add(chave);
      lidas.push({ numero, conteudo, ...(nomeDoAto === undefined ? {} : { nomeDoAto }) });
    });

    return this.unidade.executar(async (transacao) => {
      // Tipos que faltam: o nome vem da própria linha (taxonomia do curador, nunca do código).
      const tiposNovos: TipoDeAto[] = [];
      for (const lida of lidas) {
        const codigo = lida.conteudo.tipoAto;
        if (tiposNovos.some((t) => t.codigo === codigo)) continue;
        if (await this.tipos.existe(transacao, codigo)) continue;
        if (lida.nomeDoAto === undefined) {
          problemas
            .get(lida.numero)
            ?.push({ campo: 'nomeDoAto', mensagem: 'Tipo de ato novo: informe o nome.' });
          continue;
        }
        tiposNovos.push({ codigo, nome: lida.nomeDoAto, descricao: '', sinonimos: [] });
      }
      const linhas = [...problemas].map(([linha, lista]) => ({ linha, problemas: lista }));
      const codigosNovos = tiposNovos.map((t) => t.codigo);
      if (dados.data.somentePrevia || linhas.some((l) => l.problemas.length > 0)) {
        return ok({ linhas, tiposNovos: codigosNovos, propostos: [] });
      }

      for (const tipo of tiposNovos) {
        await this.tipos.inserir(transacao, tipo);
        await this.trilha.registrar(
          transacao,
          {
            tipo: 'prazos.tipo-de-ato-cadastrado',
            entidade: 'tipo_ato',
            entidadeId: tipo.codigo,
            depois: tipo,
          },
          { canal: curador.canal, usuarioId: curador.usuarioId },
        );
      }
      const propostos: VersaoListada[] = [];
      for (const lida of lidas) {
        const { conteudo } = lida;
        const numero = await this.tabela.proximaVersao(transacao, conteudo.tipoAto, conteudo.ramo);
        const proposta = VersaoDaTabela.propor(conteudo, numero, curador, this.relogio);
        // O conteúdo já passou por validarConteudo na prévia; falha aqui é defeito, não dado.
        if (!proposta.ok) throw proposta.erro;
        if (!(await this.tabela.inserir(transacao, proposta.valor))) {
          throw new Error(`Versão concorrente na importação: ${conteudo.tipoAto}/${conteudo.ramo}`);
        }
        const depois = listada(proposta.valor.estado);
        await this.trilha.registrar(
          transacao,
          {
            tipo: 'prazos.versao-da-tabela-proposta',
            entidade: 'tabela_prazo',
            entidadeId: depois.id,
            depois,
          },
          { canal: curador.canal, usuarioId: curador.usuarioId },
        );
        propostos.push(depois);
      }
      return ok({ linhas, tiposNovos: codigosNovos, propostos });
    });
  }
}
