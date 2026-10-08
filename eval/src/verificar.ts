import { detectarDadosIdentificaveis } from './anonimizar.js';
import { CasoDeAvaliacao } from './caso.js';

export interface ProblemaNoConjunto {
  readonly arquivo: string;
  readonly problema: string;
}

/**
 * Verificação automática do conjunto (PZ-160), rodada nos testes do CI: schema, ids únicos,
 * trecho literal, revisão por outra pessoa e nenhum dado identificável por formato. Nome por
 * extenso não é detectável aqui: fica com a conferência humana e a amostragem manual.
 */
export function verificarConjunto(
  arquivos: readonly { readonly arquivo: string; readonly conteudo: unknown }[],
): ProblemaNoConjunto[] {
  const problemas: ProblemaNoConjunto[] = [];
  const ids = new Map<string, string>();
  for (const { arquivo, conteudo } of arquivos) {
    const erro = (problema: string) => problemas.push({ arquivo, problema });
    const lido = CasoDeAvaliacao.safeParse(conteudo);
    if (!lido.success) {
      // Só o caminho do campo: a mensagem do Zod pode repetir o valor (o teor).
      const campos = lido.error.issues.map((i) => i.path.join('.') || '(raiz)');
      erro(`fora do formato: ${[...new Set(campos)].join(', ')}`);
      continue;
    }
    const caso = lido.data;
    const repetido = ids.get(caso.id);
    if (repetido !== undefined) erro(`id "${caso.id}" repetido (também em ${repetido})`);
    ids.set(caso.id, arquivo);
    if (`${caso.id}.json` !== arquivo.split('/').pop()) erro('o arquivo deve se chamar <id>.json');

    const achados = detectarDadosIdentificaveis(caso.teor);
    if (achados.length > 0) erro(`dado identificável no teor: ${achados.join(', ')}`);

    const { tipoAto, trecho } = caso.anotacao;
    if (trecho === '' ? tipoAto !== 'desconhecido' : !caso.teor.includes(trecho)) {
      erro('o trecho anotado precisa ser literal do teor (vazio só em "desconhecido")');
    }
    if (caso.revisor !== null && caso.revisor === caso.anotador) {
      erro('o revisor precisa ser outra pessoa');
    }
    if (caso.origem === 'real-anonimizado' && caso.anonimizacaoConferidaPor === null) {
      erro('caso real sem conferência humana da anonimização');
    }
  }
  return problemas;
}
