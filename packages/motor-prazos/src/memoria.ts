import { LocalDate } from '@pz/kernel';

import type { ResultadoDoCalculo } from './modelo.js';
import type { Instant } from '@pz/kernel';

type Json = null | boolean | number | string | readonly Json[] | { readonly [chave: string]: Json };

/** Converte para JSON com as chaves em ordem alfabética; datas e instantes viram ISO (toJSON). */
function canonico(valor: unknown): Json {
  if (valor === null || typeof valor !== 'object') return valor as Json;
  const comToJson = valor as { toJSON?: () => unknown };
  if (typeof comToJson.toJSON === 'function') return canonico(comToJson.toJSON());
  if (Array.isArray(valor)) return valor.map(canonico);
  const objeto = valor as Record<string, unknown>;
  const ordenado: Record<string, Json> = {};
  // Campo ausente (undefined) some no JSON.stringify, como no JSON comum.
  for (const chave of Object.keys(objeto).sort()) ordenado[chave] = canonico(objeto[chave]);
  return ordenado;
}

/**
 * Serialização estável do resultado, para gravar no prazo e comparar em recálculos: a mesma
 * entrada gera a mesma sequência de bytes, qualquer que seja a ordem de montagem dos campos.
 */
export function serializarResultado(resultado: ResultadoDoCalculo): string {
  return JSON.stringify(canonico(resultado));
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');
const dataBr = (data: LocalDate) =>
  `${doisDigitos(data.dia)}/${doisDigitos(data.mes)}/${String(data.ano).padStart(4, '0')}`;

const FUSO_DE_BRASILIA = 'America/Sao_Paulo';

/** "01h00 de 07/03/2027": o fim do prazo visto do horário de Brasília. */
function emBrasilia(instante: Instant): string {
  const data = LocalDate.doInstante(instante, FUSO_DE_BRASILIA);
  const minutos = Math.floor(data.inicioNoFuso(FUSO_DE_BRASILIA).msAte(instante) / 60_000);
  return `${doisDigitos(Math.floor(minutos / 60))}h${doisDigitos(minutos % 60)} de ${dataBr(data)}`;
}

/**
 * Memória de cálculo em português, linha a linha, para o portal, o e-mail e os relatórios
 * (CLAUDE.md, seção 4.4: toda data exibida vem com a memória).
 */
export function formatarMemoria(resultado: ResultadoDoCalculo): readonly string[] {
  if (resultado.situacao === 'a-confirmar') {
    return [
      `Prazo a confirmar: ${resultado.detalhe}`,
      ...(resultado.fundamentos.length === 0
        ? []
        : [`Fundamentos: ${resultado.fundamentos.join('; ')}`]),
      'O advogado informa a data, que fica marcada como definida manualmente.',
    ];
  }

  const fim =
    resultado.fusoDoJuizo === FUSO_DE_BRASILIA
      ? ''
      : `; em Brasília, ${emBrasilia(resultado.fimDoPrazo)}`;
  return [
    ...(resultado.publicacao === undefined
      ? []
      : [`Publicação considerada: ${dataBr(resultado.publicacao)}`]),
    ...(resultado.ciencia === undefined ? [] : [`Ciência: ${dataBr(resultado.ciencia)}`]),
    `Início da contagem: ${dataBr(resultado.inicio)}`,
    `Vencimento sugerido: ${dataBr(resultado.vencimento)}, até as 24h no horário do juízo (${resultado.fusoDoJuizo})${fim}`,
    ...(resultado.diasDesconsiderados.length === 0
      ? []
      : [
          'Dias desconsiderados:',
          ...resultado.diasDesconsiderados.map(
            (dia) => `- ${dataBr(dia.data)}: ${dia.motivo} (${dia.fundamento})`,
          ),
        ]),
    `Fundamentos: ${resultado.fundamentos.join('; ')}`,
    ...(resultado.alternativas.length === 0
      ? []
      : [
          'Outras datas possíveis:',
          ...resultado.alternativas.map(
            (alternativa) =>
              `- ${dataBr(alternativa.vencimento)}: ${alternativa.descricao} (${alternativa.fundamentos.join('; ')})`,
          ),
        ]),
    ...resultado.avisos.map((aviso) => `Atenção: ${aviso}`),
    `Motor ${resultado.versaoDoMotor} · tabela ${resultado.versaoDaTabela}`,
  ];
}
