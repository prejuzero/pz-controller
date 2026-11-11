import { DESCRITOR_ANTHROPIC, ProvedorIaAnthropic } from '@pz/adapter-anthropic';
import { DESCRITOR_GEMINI, ProvedorIaGemini } from '@pz/adapter-gemini';
import { ContadorDeUsoDeIaRedis, UsoDeIaPostgres } from '@pz/administracao';
import { ClassificadorIaPlataforma } from '@pz/classificacao';
import {
  comProvedorAlternativo,
  configuracaoPadrao,
  escolherProvedorIa,
  PlataformaIa,
  promptsPadrao,
  RegistroComOrcamentoDiario,
} from '@pz/ia';
import { RegistroDeAdaptadores } from '@pz/integracoes';
import { criarLogger, registrarOrcamentoDiarioIaExcedido } from '@pz/observability';

import type { ClassificadorIa, InstrucaoEmbutida } from '@pz/classificacao';
import type { Banco } from '@pz/db';
import type { AmbienteDaIa, ProvedorIaEscolhido } from '@pz/ia';
import type { Clock } from '@pz/kernel';
import type { Redis } from 'ioredis';

const logger = criarLogger('api.ia');

/** Adaptador e configuração das tarefas do provedor escolhido (ADR-022 no caso do Gemini). */
export function planoDeIa(escolhido: ProvedorIaEscolhido, relogio: Clock) {
  if (escolhido.tipo === 'anthropic') {
    return {
      descritor: DESCRITOR_ANTHROPIC,
      criar: () => new ProvedorIaAnthropic({ chave: escolhido.chave }, relogio),
      configuracao: configuracaoPadrao(),
    };
  }
  return {
    descritor: DESCRITOR_GEMINI,
    criar: () => new ProvedorIaGemini({ chave: escolhido.chave }, relogio),
    configuracao: comProvedorAlternativo(configuracaoPadrao(), {
      provedor: DESCRITOR_GEMINI.id,
      modelo: escolhido.modelo,
      // Chave gratuita e limitada: sem custo; o orçamento de tokens continua valendo.
      preco: { entrada: 0, saida: 0, cacheLido: 0 },
      fonteDoPreco: 'Gemini: chave gratuita da validação local (ADR-022)',
    }),
  };
}

/**
 * Classificador por IA do cadastro assistido (HU25, PZ-337): a mesma plataforma do worker, com
 * orçamento no Redis (compartilhado com o worker) e uso gravado. Sem provedor configurado,
 * `undefined`: só as regras rápidas, e o que elas não resolvem fica "a confirmar".
 */
export function classificadorIaDoAmbiente(
  ambiente: AmbienteDaIa & { readonly IA_ORCAMENTO_DIARIO_USD: number },
  banco: Pick<Banco, 'executarSemTenant'>,
  redis: Redis,
  relogio: Clock,
  registros: RegistroDeAdaptadores[],
): ClassificadorIa | undefined {
  const escolhido = escolherProvedorIa(ambiente, logger);
  if (escolhido === undefined) return undefined;
  const { descritor, criar, configuracao } = planoDeIa(escolhido, relogio);
  const registro = new RegistroDeAdaptadores(
    { padrao: { 'provedor-ia': descritor.id } },
    { relogio },
  );
  registro.registrar(descritor, criar);
  registro.validar();
  registros.push(registro);
  const plataforma = new PlataformaIa(
    configuracao,
    new Map([[descritor.id, registro.obter('provedor-ia')]]),
    {
      contador: new ContadorDeUsoDeIaRedis(redis),
      relogio,
      aoAlertar: (alerta) => {
        logger.warn(alerta, 'orçamento de IA acima de 80%');
      },
    },
    {
      registro: new RegistroComOrcamentoDiario(
        new UsoDeIaPostgres().registro({
          executar: (trabalho) => banco.executarSemTenant('registro do uso de IA', trabalho),
        }),
        ambiente.IA_ORCAMENTO_DIARIO_USD,
        (alerta) => {
          registrarOrcamentoDiarioIaExcedido();
          logger.error(
            { ...alerta, dia: alerta.dia.paraIso() },
            'custo diário de IA acima do orçamento',
          );
        },
      ),
      relogio,
    },
  );
  // Só o nome dos padrões e o tenant: o texto colado não vai para o log.
  const aoDetectar = (deteccao: InstrucaoEmbutida) => {
    logger.warn(deteccao, 'instrução embutida no texto do cadastro assistido (tratada como dado)');
  };
  return new ClassificadorIaPlataforma(plataforma, promptsPadrao(), aoDetectar);
}
