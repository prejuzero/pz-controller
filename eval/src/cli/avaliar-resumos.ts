import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { ProvedorIaAnthropic } from '@pz/adapter-anthropic';
import { MODELO_PADRAO_GEMINI, ProvedorIaGemini } from '@pz/adapter-gemini';
import { TAREFA_DO_RESUMO } from '@pz/classificacao';
import { promptsPadrao } from '@pz/ia';
import { ErroLimiteExcedido, ErroTransitorio } from '@pz/integracoes';
import { SystemClock } from '@pz/kernel';

import {
  arquivoDasGravacoes,
  GravadorDeProvedor,
  lerGravacoes,
  ProvedorGravado,
} from '../gravacoes.js';
import { avaliarResumos, lerCasosDeResumo, relatorioDeResumos } from '../resumos.js';

import type { ProvedorIA } from '@pz/integracoes';

/**
 * pnpm --filter @pz/eval avaliar-resumos [--gravar] [--saida <pasta>]
 *
 * Avaliação do resumo (HU62): teor → resumo, providência e trechos literais. Sem `--gravar`,
 * reproduz as gravações (CI, sem rede). Com `--gravar`, chama a API real: ANTHROPIC_API_KEY
 * (padrão do produto) ou, só com casos fictícios, GEMINI_API_KEY (ADR-022). O modelo das
 * gravações faz parte da chave: a reprodução usa o mesmo.
 */
const { values } = parseArgs({
  options: {
    gravar: { type: 'boolean', default: false },
    /** Pausa entre chamadas reais ao gravar (chave gratuita com cota por minuto). */
    'intervalo-ms': { type: 'string', default: '0' },
    saida: { type: 'string', default: fileURLToPath(new URL('../../relatorio', import.meta.url)) },
  },
});
const relogio = new SystemClock();
const intervalo = Number(values['intervalo-ms']);

const pausa = (ms: number) => new Promise((pronto) => setTimeout(pronto, ms));
const TENTATIVAS = 5;

/**
 * Só ao gravar: espaça as chamadas reais (a cota da chave gratuita é por minuto) e repete erro
 * passageiro ou de cota com espera crescente, como o registro de adaptadores faz em produção.
 */
function espacado(real: ProvedorIA): ProvedorIA {
  let ultima = 0;
  return {
    async gerarEstruturado(prompt, schema, opcoes) {
      for (let tentativa = 1; ; tentativa++) {
        const espera = ultima + intervalo - Date.now();
        if (espera > 0) await pausa(espera);
        ultima = Date.now();
        try {
          return await real.gerarEstruturado(prompt, schema, opcoes);
        } catch (erro) {
          const passageiro = erro instanceof ErroTransitorio || erro instanceof ErroLimiteExcedido;
          if (!passageiro || tentativa >= TENTATIVAS) throw erro;
          process.stderr.write(`tentativa ${String(tentativa)}: ${(erro as Error).message}\n`);
          await pausa(15_000 * tentativa);
        }
      }
    },
    saude: () => real.saude(),
  };
}
const casos = lerCasosDeResumo();
const versaoDoPrompt = promptsPadrao().versao(TAREFA_DO_RESUMO);
const caminho = arquivoDasGravacoes(versaoDoPrompt);

let provedor: ProvedorGravado | GravadorDeProvedor;
let modelo: string;
if (values.gravar) {
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  if (anthropic !== undefined && anthropic !== '') {
    modelo = 'claude-sonnet-5-5';
    provedor = new GravadorDeProvedor(
      new ProvedorIaAnthropic({ chave: anthropic }, relogio),
      relogio,
    );
  } else if (gemini !== undefined && gemini !== '') {
    if (casos.some((c) => c.origem !== 'ficticio')) {
      process.stderr.write('Gemini só com casos fictícios (ADR-022).\n');
      process.exit(1);
    }
    modelo = process.env.GEMINI_MODELO ?? MODELO_PADRAO_GEMINI;
    provedor = new GravadorDeProvedor(
      espacado(new ProvedorIaGemini({ chave: gemini }, relogio)),
      relogio,
    );
  } else {
    process.stderr.write('--gravar exige ANTHROPIC_API_KEY ou GEMINI_API_KEY no ambiente.\n');
    process.exit(1);
  }
} else {
  const gravacoes = lerGravacoes(caminho);
  modelo = Object.values(gravacoes)[0]?.modelo ?? 'sem-gravacao';
  provedor = new ProvedorGravado(gravacoes, relogio);
}

const resultados = await avaliarResumos(casos, provedor, modelo);
const { markdown, aprovado, aviso } = relatorioDeResumos(resultados, versaoDoPrompt, modelo);
mkdirSync(values.saida, { recursive: true });
writeFileSync(join(values.saida, 'resumos.md'), markdown);
if (provedor instanceof GravadorDeProvedor) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, `${JSON.stringify(provedor.gravacoes, null, 2)}\n`);
}
process.stdout.write(markdown);
const resumo = process.env.GITHUB_STEP_SUMMARY;
if (resumo !== undefined) appendFileSync(resumo, markdown);
if (!aprovado) {
  process.stderr.write(`::error title=Avaliação do resumo::${aviso ?? 'reprovada'}\n`);
  process.exit(1);
}
if (aviso !== undefined) process.stderr.write(`::warning title=Avaliação do resumo::${aviso}\n`);
