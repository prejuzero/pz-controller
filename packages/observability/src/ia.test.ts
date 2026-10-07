import { MetricReader } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  medirChamadaIa,
  NOMES_METRICAS_IA,
  registrarAlertaDeOrcamentoIa,
  registrarCorrecaoDeIa,
  registrarTarefaIaSemModelo,
} from './ia.js';
import { iniciarTelemetria } from './telemetria.js';

import type { Telemetria } from './telemetria.js';

class LeitorEmMemoria extends MetricReader {
  protected onForceFlush(): Promise<void> {
    return Promise.resolve();
  }
  protected onShutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const chamada = {
  tarefa: 'classificar-ato',
  provedor: 'falso',
  modelo: 'modelo-a1',
  versaoPrompt: 'classificar-ato@0.1.0',
  tenantId: 'tenant-ficticio',
};

describe('observabilidade de IA (HU58)', () => {
  let telemetria: Telemetria;
  let leitor: LeitorEmMemoria;
  let spans: InMemorySpanExporter;

  beforeEach(() => {
    leitor = new LeitorEmMemoria();
    spans = new InMemorySpanExporter();
    telemetria = iniciarTelemetria({
      servico: 'pz-teste',
      versao: 'abc123',
      ambiente: 'test',
      leitorDeMetricas: leitor,
      exportadorDeSpans: spans,
    });
  });
  afterEach(async () => {
    await telemetria.encerrar();
  });

  async function pontos(nome: string) {
    const { resourceMetrics } = await leitor.collect();
    const metrica = resourceMetrics.scopeMetrics
      .flatMap((escopo) => escopo.metrics)
      .find((m) => m.descriptor.name === nome);
    return metrica?.dataPoints.map((p) => ({ atributos: p.attributes, valor: p.value }));
  }

  it('sucesso: span GenAI com tokens, versão do prompt e tenant; métricas sem tenant', async () => {
    const valor = await medirChamadaIa(
      chamada,
      () => Promise.resolve('ok'),
      () => ({ resultado: 'sucesso', tokensEntrada: 100, tokensSaida: 20, tokensCacheLidos: 80 }),
    );
    expect(valor).toBe('ok');
    const [span] = spans.getFinishedSpans();
    expect(span?.name).toBe('ia classificar-ato');
    expect(span?.attributes).toMatchObject({
      'gen_ai.system': 'falso',
      'gen_ai.request.model': 'modelo-a1',
      'gen_ai.usage.input_tokens': 100,
      'gen_ai.usage.output_tokens': 20,
      'pz.ia.tokens_cache_lidos': 80,
      'pz.ia.versao_prompt': 'classificar-ato@0.1.0',
      'pz.ia.validacao': 'sucesso',
      'pz.tenant_id': 'tenant-ficticio',
    });
    expect(await pontos(NOMES_METRICAS_IA.tokens)).toEqual([
      {
        atributos: { tarefa: 'classificar-ato', modelo: 'modelo-a1', tipo: 'entrada' },
        valor: 100,
      },
      { atributos: { tarefa: 'classificar-ato', modelo: 'modelo-a1', tipo: 'saida' }, valor: 20 },
      { atributos: { tarefa: 'classificar-ato', modelo: 'modelo-a1', tipo: 'cache' }, valor: 80 },
    ]);
  });

  it('erro: span com status de erro, fallback contado e o erro relançado', async () => {
    const erro = new Error('fora do ar');
    await expect(
      medirChamadaIa(
        chamada,
        () => Promise.reject(erro),
        () => ({ resultado: 'erro-transitorio' }),
      ),
    ).rejects.toBe(erro);
    expect(spans.getFinishedSpans()[0]?.status.code).toBe(2);
    expect(await pontos(NOMES_METRICAS_IA.fallbacks)).toEqual([
      { atributos: { tarefa: 'classificar-ato', modelo: 'modelo-a1' }, valor: 1 },
    ]);
  });

  it('contadores de tarefa sem modelo, alerta de orçamento e correções', async () => {
    registrarTarefaIaSemModelo('classificar-ato');
    registrarAlertaDeOrcamentoIa('classificar-ato');
    registrarCorrecaoDeIa('classificar-ato');
    for (const nome of [
      NOMES_METRICAS_IA.esgotadas,
      NOMES_METRICAS_IA.orcamentoAlertas,
      NOMES_METRICAS_IA.correcoes,
    ]) {
      expect(await pontos(nome)).toEqual([{ atributos: { tarefa: 'classificar-ato' }, valor: 1 }]);
    }
  });
});
