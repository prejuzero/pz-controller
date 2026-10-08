import { minimizarDadosPessoais } from '@pz/ia';

/**
 * Anonimização dos teores do conjunto de avaliação (PZ-160). Troca por marcadores o que tem
 * formato reconhecível (CPF, CNPJ, e-mail, CEP, telefone, número CNJ, OAB, endereço) e os nomes
 * informados (partes e advogados, que vêm dos metadados da publicação). Nome por extenso sem
 * lista não é detectável com segurança: vira "suspeita" para a conferência humana, que é
 * obrigatória antes de o caso entrar no repositório.
 */

const FORMATOS: readonly (readonly [tipo: string, marcador: string, padrao: RegExp])[] = [
  // NNNNNNN-DD.AAAA.J.TR.OOOO, com ou sem pontuação (Res. CNJ 65/2008).
  ['numero-cnj', '[PROCESSO]', /(?<!\d)\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}(?!\d)/g],
  [
    'oab',
    '[OAB]',
    /\bOAB\s*(?:[/-]\s*[A-Z]{2}\s*)?(?:n[º°o.]*\s*)?\d[\d.]*(?:-?[A-Z]\b)?(?:\s*[/-]\s*[A-Z]{2}\b)?/gi,
  ],
  [
    'endereco',
    '[ENDEREÇO]',
    /\b(?:Rua|Avenida|Av\.|Travessa|Alameda|Pra[çc]a|Rodovia|Estrada|Largo)\s+[^,\n]{2,60},?\s*(?:n[º°o.]*\s*)?\d+/gi,
  ],
];

/** Tipos de dado identificável (por formato) encontrados no texto. */
export function detectarDadosIdentificaveis(texto: string): string[] {
  const achados = FORMATOS.filter(([, , padrao]) => new RegExp(padrao).test(texto)).map(
    ([tipo]) => tipo,
  );
  if (minimizarDadosPessoais(texto) !== texto) achados.push('dados-pessoais');
  return achados;
}

/** Letra sem acento e minúscula, um caractere por caractere (mantém as posições). */
// Caractere a caractere (unidade UTF-16): cada letra acentuada vira uma letra só, então as
// posições do texto sem acento valem para o texto original.
const semAcento = (texto: string): string =>
  texto
    .replace(/[^\x20-\x7e]/g, (c) => {
      const base = c.normalize('NFD').replace(/\p{M}/gu, '');
      return base.length === 1 ? base : c;
    })
    .toLowerCase();

const LETRA = /[\p{L}\p{N}]/u;

function trocarNome(texto: string, nome: string, marcador: string): string {
  const alvo = semAcento(nome.trim().replace(/\s+/g, ' '));
  if (alvo === '') return texto;
  let resultado = texto;
  let busca = semAcento(resultado);
  let i = busca.indexOf(alvo);
  while (i !== -1) {
    const antes = busca[i - 1];
    const depois = busca[i + alvo.length];
    const palavraInteira =
      (antes === undefined || !LETRA.test(antes)) && (depois === undefined || !LETRA.test(depois));
    if (palavraInteira) {
      resultado = resultado.slice(0, i) + marcador + resultado.slice(i + alvo.length);
      busca = semAcento(resultado);
      i = busca.indexOf(alvo, i + marcador.length);
    } else {
      i = busca.indexOf(alvo, i + 1);
    }
  }
  return resultado;
}

// Palavras comuns em publicações escritas com inicial maiúscula ou em caixa alta. Uma sequência
// só é suspeita se tiver alguma palavra fora desta lista.
const PALAVRAS_DO_FORO = new Set(
  (
    'a o as os ao aos à às e de da do das dos em no na nos nas para por com se ' +
    'vistos ante exposto posto isto diante julgo procedente procedentes improcedente ' +
    'parcialmente intime intimem intimese cite citese publique registre cumpra ' +
    'defiro indefiro homologo determino arquivem arquivese' +
    ' juiz juiza juízo juizo direito vara civel cível criminal trabalho federal estadual ' +
    'tribunal regional justiça justica ministerio ministério publico público fazenda publica ' +
    'pública defensoria codigo código processo civil penal lei art artigo estado municipio ' +
    'município uniao união sentença sentenca decisao decisão despacho autos comarca foro ' +
    'juizado juizados especial especiais secretaria cartorio cartório oficial audiencia ' +
    'audiência conciliacao conciliação instrução instrucao julgamento autor autora reu réu ' +
    'requerente requerido requerida reclamante reclamada reclamado exequente executado ' +
    'executada apelante apelado embargante embargado agravante agravado ' +
    'parte partes nome processo oab endereço endereco cpf cnpj cep telefone e-mail email'
  ).split(/\s+/),
);

const SEQUENCIAS = [
  // "Maria Aparecida dos Santos"
  /\p{Lu}\p{Ll}+(?:\s+(?:d[aeo]s?\s+|e\s+)?\p{Lu}\p{Ll}+)+/gu,
  // "MARIA APARECIDA DOS SANTOS"
  /\p{Lu}{2,}(?:\s+(?:D[AEO]S?\s+|E\s+)?\p{Lu}{2,})+/gu,
];

/** Sequências com cara de nome próprio que sobraram no texto, para a conferência humana. */
export function suspeitasDeNome(texto: string): string[] {
  const achadas = SEQUENCIAS.flatMap((padrao) => [...texto.matchAll(padrao)].map(([s]) => s));
  const suspeitas = achadas.filter((s) =>
    s.split(/\s+/).some((palavra) => !PALAVRAS_DO_FORO.has(semAcento(palavra))),
  );
  return [...new Set(suspeitas)];
}

export interface TeorAnonimizado {
  readonly texto: string;
  /** O que ainda parece nome próprio: conferir à mão antes de versionar. */
  readonly suspeitas: readonly string[];
}

/**
 * Anonimiza o teor: nomes informados viram `[NOME n]` (na ordem da lista; o mesmo nome recebe
 * sempre o mesmo marcador) e os formatos reconhecíveis viram seus marcadores.
 */
export function anonimizar(teor: string, nomes: readonly string[] = []): TeorAnonimizado {
  // Nomes mais longos primeiro: "Maria da Silva Souza" antes de "Maria da Silva".
  const ordenados = nomes
    .map((nome, i) => ({ nome, marcador: `[NOME ${String(i + 1)}]` }))
    .sort((a, b) => b.nome.length - a.nome.length);
  const semNomes = ordenados.reduce(
    (texto, { nome, marcador }) => trocarNome(texto, nome, marcador),
    teor,
  );
  // Formatos próprios antes da minimização: o número CNJ não pode virar CPF pela metade.
  const texto = minimizarDadosPessoais(
    FORMATOS.reduce((atual, [, marcador, padrao]) => atual.replace(padrao, marcador), semNomes),
  );
  return { texto, suspeitas: suspeitasDeNome(texto) };
}
