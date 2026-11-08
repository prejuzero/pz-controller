import { err, lerCsv, NumeroCnj, ok, Validacao } from '@pz/kernel';

import type { ProblemaValidacao, Result } from '@pz/kernel';

/**
 * Leitura da planilha de processos (HU42, RF04; decisão do usuário em 08/11/2026: só CSV). Só
 * `numeroCnj` é obrigatória; as demais colunas podem faltar ou vir em qualquer ordem.
 */
export const COLUNAS_DA_IMPORTACAO = ['numeroCnj', 'orgao', 'comarca', 'sigiloso'] as const;
type Coluna = (typeof COLUNAS_DA_IMPORTACAO)[number];
export const MAXIMO_DE_LINHAS_DA_IMPORTACAO = 1000;
const MAXIMO_DO_TEXTO = 200;

const SIM = new Set(['sim', 's', 'true', '1']);
const NAO = new Set(['não', 'nao', 'n', 'false', '0']);

/** Processo pronto para o cadastro: número com os 20 dígitos. */
export interface ProcessoDaPlanilha {
  readonly numeroCnj: string;
  readonly orgao: string | null;
  readonly comarca: string | null;
  readonly sigiloso: boolean;
}

export interface LinhaDaPlanilha {
  /** Número da linha no arquivo (o cabeçalho é a 1). */
  readonly linha: number;
  /** Ausente quando a linha tem problema. */
  readonly processo?: ProcessoDaPlanilha;
  readonly problemas: readonly ProblemaValidacao[];
}

const invalido = (mensagem: string) => err(new Validacao([{ campo: 'csv', mensagem }]));

export function lerPlanilhaDeProcessos(csv: string): Result<LinhaDaPlanilha[], Validacao> {
  const [cabecalho = [], ...corpo] = lerCsv(csv);
  const colunas = cabecalho.map((c) => c.trim());
  const desconhecidas = colunas.filter(
    (c) => !(COLUNAS_DA_IMPORTACAO as readonly string[]).includes(c),
  );
  if (!colunas.includes('numeroCnj') || desconhecidas.length > 0) {
    return invalido(
      `Cabeçalho com a coluna numeroCnj e, se quiser, ${COLUNAS_DA_IMPORTACAO.slice(1).join(', ')}.`,
    );
  }
  if (new Set(colunas).size !== colunas.length) return invalido('Coluna repetida no cabeçalho.');
  if (corpo.length === 0 || corpo.length > MAXIMO_DE_LINHAS_DA_IMPORTACAO) {
    return invalido(`De 1 a ${String(MAXIMO_DE_LINHAS_DA_IMPORTACAO)} processos por arquivo.`);
  }

  const vistos = new Map<string, number>();
  return ok(
    corpo.map((celulas, indice): LinhaDaPlanilha => {
      const linha = indice + 2;
      const valor = (coluna: Coluna) => {
        const i = colunas.indexOf(coluna);
        return i < 0 ? '' : (celulas[i]?.trim() ?? '');
      };
      const problemas: ProblemaValidacao[] = [];
      if (celulas.length > colunas.length) {
        problemas.push({ campo: 'csv', mensagem: 'Colunas a mais na linha.' });
      }
      const numero = NumeroCnj.de(valor('numeroCnj'));
      if (!numero.ok) problemas.push(...numero.erro.problemas);
      const textos = { orgao: valor('orgao'), comarca: valor('comarca') };
      for (const [campo, texto] of Object.entries(textos)) {
        if (texto.length > MAXIMO_DO_TEXTO) {
          problemas.push({ campo, mensagem: `Até ${String(MAXIMO_DO_TEXTO)} caracteres.` });
        }
      }
      const sigilo = valor('sigiloso').toLocaleLowerCase('pt-BR');
      if (sigilo !== '' && !SIM.has(sigilo) && !NAO.has(sigilo)) {
        problemas.push({ campo: 'sigiloso', mensagem: 'Use "sim" ou "não".' });
      }
      if (numero.ok) {
        const anterior = vistos.get(numero.valor.valor);
        if (anterior !== undefined) {
          problemas.push({
            campo: 'numeroCnj',
            mensagem: `Processo repetido no arquivo (linha ${String(anterior)}).`,
          });
        } else vistos.set(numero.valor.valor, linha);
      }
      if (!numero.ok || problemas.length > 0) return { linha, problemas };
      return {
        linha,
        processo: {
          numeroCnj: numero.valor.valor,
          orgao: textos.orgao === '' ? null : textos.orgao,
          comarca: textos.comarca === '' ? null : textos.comarca,
          sigiloso: SIM.has(sigilo),
        },
        problemas,
      };
    }),
  );
}
