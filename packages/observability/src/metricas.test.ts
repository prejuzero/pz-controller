import { MetricReader } from '@opentelemetry/sdk-metrics';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  LIMITES_SLO_PIPELINE_SEGUNDOS,
  NOMES_METRICAS,
  registrarEmailEnviado,
  registrarPublicacaoVisivel,
  registrarChamadaIntegracao,
  registrarErroInesperado,
  registrarEstadoCircuito,
  registrarJobProcessado,
  registrarAlvoFalhando,
  registrarDivergenciaDeAuditoria,
  registrarSituacaoDaFonte,
  registrarRejeicaoEmail,
  registrarRequisicaoDoCliente,
  registrarWebhookRecusado,
  registrarSituacaoDasFilas,
} from './metricas.js';
import { iniciarTelemetria } from './telemetria.js';

import type { Telemetria } from './telemetria.js';
import type { MetricData } from '@opentelemetry/sdk-metrics';

class LeitorEmMemoria extends MetricReader {
  protected onForceFlush(): Promise<void> {
    return Promise.resolve();
  }
  protected onShutdown(): Promise<void> {
    return Promise.resolve();
  }
}

describe('catálogo de métricas', () => {
  let telemetria: Telemetria;
  let leitor: LeitorEmMemoria;

  beforeEach(() => {
    leitor = new LeitorEmMemoria();
    telemetria = iniciarTelemetria({
      servico: 'pz-teste',
      versao: 'abc123',
      ambiente: 'test',
      leitorDeMetricas: leitor,
    });
  });
  afterEach(async () => {
    await telemetria.encerrar();
  });

  async function coletar(): Promise<Map<string, MetricData>> {
    const { resourceMetrics } = await leitor.collect();
    return new Map(
      resourceMetrics.scopeMetrics
        .flatMap((escopo) => escopo.metrics)
        .map((metrica) => [metrica.descriptor.name, metrica]),
    );
  }

  function pontos(metrica: MetricData | undefined) {
    return metrica?.dataPoints.map((ponto) => ({
      atributos: ponto.attributes,
      valor: ponto.value,
    }));
  }

  it('SLOs do pipeline (HU40): histogramas com os limites de 10 e 30 min; negativo vira 0', async () => {
    registrarPublicacaoVisivel('djen', 125);
    registrarEmailEnviado('nova-intimacao', -3);

    const metricas = await coletar();
    const publicacao = metricas.get(NOMES_METRICAS.sloPublicacaoVisivel)?.dataPoints[0];
    const email = metricas.get(NOMES_METRICAS.sloEmailEnviado)?.dataPoints[0];
    expect(publicacao?.attributes).toEqual({ fonte: 'djen' });
    expect(publicacao?.value).toMatchObject({
      sum: 125,
      buckets: { boundaries: [...LIMITES_SLO_PIPELINE_SEGUNDOS] },
    });
    expect(email?.attributes).toEqual({ tipo: 'nova-intimacao' });
    expect(email?.value).toMatchObject({ sum: 0 });
    expect(LIMITES_SLO_PIPELINE_SEGUNDOS).toEqual(expect.arrayContaining([600, 1800]));
  });

  it('registra integrações, circuito, e-mail, erros e jobs com os atributos dos dashboards', async () => {
    registrarChamadaIntegracao('djen', 'listarPublicacoes', 'falha', 1.5);
    registrarEstadoCircuito('djen', 'aberto');
    registrarRejeicaoEmail('bounce');
    registrarErroInesperado('captura');
    registrarJobProcessado('captura', 'sucesso', 0.2);
    registrarWebhookRecusado('ses');
    registrarRequisicaoDoCliente('android', '1.2.0', true);
    registrarDivergenciaDeAuditoria();
    registrarSituacaoDaFonte('djen', true);
    registrarAlvoFalhando();

    const metricas = await coletar();
    expect(pontos(metricas.get(NOMES_METRICAS.capturaFonteDegradada))).toEqual([
      { atributos: { fonte: 'djen' }, valor: 1 },
    ]);
    expect(pontos(metricas.get(NOMES_METRICAS.capturaAlvoFalhando))).toEqual([
      { atributos: {}, valor: 1 },
    ]);
    expect(pontos(metricas.get(NOMES_METRICAS.requisicoesPorCliente))).toEqual([
      { atributos: { plataforma: 'android', versao: '1.2.0', barrada: 'true' }, valor: 1 },
    ]);
    expect(pontos(metricas.get(NOMES_METRICAS.webhooksRecusados))).toEqual([
      { atributos: { adaptador: 'ses' }, valor: 1 },
    ]);
    expect(pontos(metricas.get(NOMES_METRICAS.auditoriaDivergencias))).toEqual([
      { atributos: {}, valor: 1 },
    ]);

    expect(metricas.get(NOMES_METRICAS.integracaoDuracao)?.dataPoints[0]?.attributes).toEqual({
      adaptador: 'djen',
      operacao: 'listarPublicacoes',
      resultado: 'falha',
    });
    expect(pontos(metricas.get(NOMES_METRICAS.integracaoCircuito))).toEqual([
      { atributos: { adaptador: 'djen' }, valor: 2 },
    ]);
    expect(pontos(metricas.get(NOMES_METRICAS.emailRejeicoes))).toEqual([
      { atributos: { motivo: 'bounce' }, valor: 1 },
    ]);
    expect(pontos(metricas.get(NOMES_METRICAS.erros))).toEqual([
      { atributos: { origem: 'captura' }, valor: 1 },
    ]);
    expect(metricas.get(NOMES_METRICAS.jobDuracao)?.dataPoints[0]?.attributes).toEqual({
      fila: 'captura',
      resultado: 'sucesso',
    });
  });

  it('lê a situação das filas a cada coleta e para depois de cancelado', async () => {
    let consultas = 0;
    const cancelar = registrarSituacaoDasFilas(() => {
      consultas += 1;
      return Promise.resolve([
        { fila: 'captura', aguardando: 12, idadeMaisAntigoSegundos: 900, dlq: 1 },
      ]);
    });

    const metricas = await coletar();
    expect(pontos(metricas.get(NOMES_METRICAS.filaAguardando))).toEqual([
      { atributos: { fila: 'captura' }, valor: 12 },
    ]);
    expect(pontos(metricas.get(NOMES_METRICAS.filaIdadeMaisAntigo))).toEqual([
      { atributos: { fila: 'captura' }, valor: 900 },
    ]);
    expect(pontos(metricas.get(NOMES_METRICAS.filaDlq))).toEqual([
      { atributos: { fila: 'captura' }, valor: 1 },
    ]);

    cancelar();
    await coletar();
    expect(consultas).toBe(1);
  });
});
