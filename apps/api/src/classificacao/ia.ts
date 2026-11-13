import { DESCRITOR_ANTHROPIC, ProvedorIaAnthropic } from '@pz/adapter-anthropic';
import { DESCRITOR_GEMINI, DESCRITOR_GEMINI_PAGO, ProvedorIaGemini } from '@pz/adapter-gemini';
import { DESCRITOR_OPENAI, ProvedorIaOpenAi } from '@pz/adapter-openai';
import { ContadorDeUsoDeIaRedis, UsoDeIaPostgres } from '@pz/administracao';
import { ClassificadorIaPlataforma } from '@pz/classificacao';
import {
  configuracaoDosProvedores,
  configuracaoPadrao,
  escolherProvedoresIa,
  PlataformaIa,
  promptsPadrao,
  RegistroComOrcamentoDiario,
} from '@pz/ia';
import { RegistroDeAdaptadores } from '@pz/integracoes';
import { criarLogger, registrarErro, registrarOrcamentoDiarioIaExcedido } from '@pz/observability';

import type { ClassificadorIa, FalhaDaIa, InstrucaoEmbutida } from '@pz/classificacao';
import type { Banco } from '@pz/db';
import type { AmbienteDaIa, ProvedorIaEscolhido } from '@pz/ia';
import type { Clock } from '@pz/kernel';
import type { Redis } from 'ioredis';

const logger = criarLogger('api.ia');

/** Adaptador de cada provedor escolhido (ADR-005): o registro aplica limites e telemetria. */
export function adaptadorDeIa(escolhido: ProvedorIaEscolhido, relogio: Clock) {
  switch (escolhido.tipo) {
    case 'anthropic':
      return {
        descritor: DESCRITOR_ANTHROPIC,
        criar: () => new ProvedorIaAnthropic({ chave: escolhido.chave }, relogio),
      };
    case 'openai':
      return {
        descritor: DESCRITOR_OPENAI,
        criar: () => new ProvedorIaOpenAi({ chave: escolhido.chave }, relogio),
      };
    case 'gemini':
      return {
        descritor: escolhido.plano === 'pago' ? DESCRITOR_GEMINI_PAGO : DESCRITOR_GEMINI,
        criar: () => new ProvedorIaGemini({ chave: escolhido.chave }, relogio),
      };
  }
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
  const escolhidos = escolherProvedoresIa(ambiente, logger);
  if (escolhidos.length === 0) return undefined;
  // Um registro por provedor; a plataforma tenta na ordem de IA_PROVEDORES (fallback, ADR-024).
  const provedores = new Map(
    escolhidos.map((escolhido) => {
      const { descritor, criar } = adaptadorDeIa(escolhido, relogio);
      const registro = new RegistroDeAdaptadores(
        { padrao: { 'provedor-ia': descritor.id } },
        { relogio },
      );
      registro.registrar(descritor, criar);
      registro.validar();
      registros.push(registro);
      return [descritor.id, registro.obter('provedor-ia')] as const;
    }),
  );
  const plataforma = new PlataformaIa(
    configuracaoDosProvedores(configuracaoPadrao(), escolhidos),
    provedores,
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
  // Erro permanente da IA (pedido recusado, saída fora do schema): log, métrica e alerta.
  const aoFalhar = (falha: FalhaDaIa) => {
    registrarErro(
      logger,
      new Error(`IA: ${falha.motivo}`),
      `tarefa ${falha.tarefa} sem resposta válida da IA no cadastro assistido`,
      'ia.saida-invalida',
    );
  };
  return new ClassificadorIaPlataforma(plataforma, promptsPadrao(), aoDetectar, aoFalhar);
}
