import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { ProvedorIaAnthropic } from '@pz/adapter-anthropic';
import { TAREFA_DE_CLASSIFICACAO } from '@pz/classificacao';
import { configuracaoPadrao, promptsPadrao } from '@pz/ia';
import { SystemClock } from '@pz/kernel';

import { avaliar } from '../avaliar.js';
import { CasoDeAvaliacao } from '../caso.js';
import { lerArquivosDoConjunto } from '../conjunto.js';
import {
  arquivoDasGravacoes,
  GravadorDeProvedor,
  lerGravacoes,
  ProvedorGravado,
} from '../gravacoes.js';
import { lerReferencia } from '../referencia.js';
import { montarRelatorio, relatorioEmMarkdown } from '../relatorio.js';
import { verificarConjunto } from '../verificar.js';

/**
 * pnpm eval [--gravar] [--saida <pasta>]
 *
 * Roda o conjunto pelas regras e pela plataforma de IA e gera o relatório (Markdown e JSON).
 * Sem `--gravar`, reproduz as respostas gravadas em `gravacoes/` (CI, sem rede). Com `--gravar`,
 * chama a API real (ANTHROPIC_API_KEY), regrava as respostas da versão atual do prompt e grava o
 * histórico em `historico/`. Sai com código 1 se o gate reprovar.
 */
const { values } = parseArgs({
  options: {
    gravar: { type: 'boolean', default: false },
    saida: { type: 'string', default: fileURLToPath(new URL('../../relatorio', import.meta.url)) },
  },
});
const raiz = fileURLToPath(new URL('../..', import.meta.url));
const relogio = new SystemClock();
const escrever = (caminho: string, conteudo: unknown) => {
  writeFileSync(caminho, `${JSON.stringify(conteudo, null, 2)}\n`);
};

const arquivos = lerArquivosDoConjunto();
const problemas = verificarConjunto(arquivos);
if (problemas.length > 0) {
  for (const p of problemas) process.stderr.write(`${p.arquivo}: ${p.problema}\n`);
  process.exit(1);
}
const casos = arquivos.map(({ conteudo }) => CasoDeAvaliacao.parse(conteudo));
const referencia = lerReferencia();
const configuracao = configuracaoPadrao();
const versaoDoPrompt = promptsPadrao().versao(TAREFA_DE_CLASSIFICACAO);
const caminhoDasGravacoes = arquivoDasGravacoes(versaoDoPrompt);

let provedor: ProvedorGravado | GravadorDeProvedor;
if (values.gravar) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (chave === undefined || chave === '') {
    process.stderr.write('--gravar exige ANTHROPIC_API_KEY no ambiente.\n');
    process.exit(1);
  }
  provedor = new GravadorDeProvedor(new ProvedorIaAnthropic({ chave }, relogio), relogio);
} else {
  provedor = new ProvedorGravado(lerGravacoes(caminhoDasGravacoes), relogio);
}

const resultados = await avaliar(casos, referencia, provedor, relogio);
const relatorio = montarRelatorio(
  resultados,
  configuracao,
  {
    versaoDoPrompt,
    versaoDaConfiguracao: configuracao.versao,
    versaoDaTaxonomia: referencia.taxonomia.versao,
    versaoDasRegras: referencia.regras.versao,
  },
  referencia.taxonomia.provisoria || referencia.regras.provisoria,
);
const markdown = relatorioEmMarkdown(relatorio);

mkdirSync(values.saida, { recursive: true });
writeFileSync(join(values.saida, 'relatorio.md'), markdown);
escrever(join(values.saida, 'relatorio.json'), relatorio);
if (provedor instanceof GravadorDeProvedor) {
  // Só as chamadas desta rodada: gravação de configuração antiga não fica para trás.
  escrever(caminhoDasGravacoes, provedor.gravacoes);
  mkdirSync(join(raiz, 'historico'), { recursive: true });
  escrever(join(raiz, 'historico', `${versaoDoPrompt}.json`), {
    ...relatorio,
    medidoEm: relogio.agora().toString(),
  });
}

process.stdout.write(markdown);
const resumo = process.env.GITHUB_STEP_SUMMARY;
if (resumo !== undefined) appendFileSync(resumo, markdown);
const { veredito } = relatorio;
if (!veredito.aprovado) {
  process.stderr.write(`::error title=Avaliação da IA::${veredito.motivo}\n`);
  process.exit(1);
}
if (veredito.aviso !== undefined) {
  process.stderr.write(`::warning title=Avaliação da IA::${veredito.aviso}\n`);
}
