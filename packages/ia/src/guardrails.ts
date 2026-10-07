import { ErroPermanente } from '@pz/integracoes';

/**
 * Guardrails da plataforma de IA (HU58, ADR-016). Conteúdo externo (publicação, mensagem, PDF)
 * é dado, não instrução: vai escapado para dentro do bloco delimitado do prompt, e tentativas de
 * instrução embutida são detectadas e registradas (sem bloquear: o texto segue como dado).
 */

/** Escapa `<` e `>`: o texto não fecha o bloco `<publicacao>` nem abre outro. */
export function isolarConteudoExterno(texto: string): string {
  return texto.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PADROES_DE_INJECAO: readonly (readonly [string, RegExp])[] = [
  [
    'ignorar-instrucoes',
    /\b(ignore|desconsidere|esque[çc]a)\b.{0,40}\b(instru[çc][õo]es|regras|comandos|prompt)\b/i,
  ],
  ['ignore-instructions', /\b(ignore|disregard|forget)\b.{0,40}\b(instructions|rules|prompt)\b/i],
  // Sem \b depois de vogal acentuada: no JavaScript, \b só conhece letras ASCII.
  ['troca-de-papel', /(^|\s)(voc[êe]\s+(agora\s+)?[ée]\s|act as\b|you are now\b|aja como\b)/i],
  ['prompt-de-sistema', /\b(system prompt|prompt do sistema|mensagem do sistema)\b/i],
  ['marcacao-de-papel', /<\/?\s*(system|assistant|user|sistema|publicacao)\s*>/i],
  [
    'ordem-de-resposta',
    /\b(responda|retorne|devolva|answer|respond)\b.{0,30}\b(apenas|somente|only)\b/i,
  ],
];

/** Nomes dos padrões de instrução embutida encontrados no texto externo (para registro). */
export function detectarInstrucaoEmbutida(texto: string): string[] {
  return PADROES_DE_INJECAO.filter(([, padrao]) => padrao.test(texto)).map(([nome]) => nome);
}

const DADOS_PESSOAIS: readonly (readonly [string, RegExp])[] = [
  ['[E-MAIL]', /[\w.+-]+@[\w-]+(\.[\w-]+)+/g],
  // CNPJ antes do CPF: o formato do CNPJ contém um trecho parecido com CPF.
  ['[CNPJ]', /(?<![\d./-])\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?![\d./-])/g],
  ['[CPF]', /(?<![\d./-])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\d./-])/g],
  ['[CEP]', /(?<![\d.-])\d{5}-\d{3}(?![\d.-])/g],
  ['[TELEFONE]', /\(\d{2}\)\s?9?\d{4}-?\d{4}(?!\d)/g],
];

/**
 * Minimização de dados pessoais (LGPD): troca CPF, CNPJ, e-mail, CEP e telefone com DDD por
 * marcadores quando a tarefa não precisa deles. Número de processo e OAB não são afetados.
 * Endereço e nome por extenso não são detectados aqui (só por padrões de formato).
 */
export function minimizarDadosPessoais(texto: string): string {
  return DADOS_PESSOAIS.reduce(
    (atual, [marcador, padrao]) => atual.replace(padrao, marcador),
    texto,
  );
}

const DATA = [
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}º?\s+de\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i,
];

/**
 * A IA nunca devolve datas (ADR-008): procura datas em todos os textos da saída, exceto nos
 * campos de trecho literal do documento (ex.: `trecho`). Encontrou: erro, e a saída vai para
 * revisão manual.
 */
export function verificarSaidaSemDatas(saida: unknown, excetoCampos: readonly string[]): void {
  const visitar = (valor: unknown, caminho: string): void => {
    if (typeof valor === 'string') {
      if (DATA.some((padrao) => padrao.test(valor))) {
        throw new ErroPermanente(`Saída de IA com data em "${caminho || '(raiz)'}"`, 'ia');
      }
    } else if (Array.isArray(valor)) {
      valor.forEach((item, i) => {
        visitar(item, `${caminho}[${String(i)}]`);
      });
    } else if (typeof valor === 'object' && valor !== null) {
      for (const [chave, item] of Object.entries(valor)) {
        if (excetoCampos.includes(chave)) continue;
        visitar(item, caminho === '' ? chave : `${caminho}.${chave}`);
      }
    }
  };
  visitar(saida, '');
}
