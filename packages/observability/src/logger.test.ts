import { Writable } from 'node:stream';

import { context, propagation, trace, TraceFlags } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, describe, expect, it } from 'vitest';

import { executarComContexto } from './contexto.js';
import { criarLogger } from './logger.js';
import { MARCADOR_REMOVIDO } from './sanitizacao.js';

// Dados fictícios, gerados só para o teste.
const CPF = '123.456.789-09';
const SENHA = 'S3nh@-de-teste';
// JWT fictício montado em partes: o literal completo aciona os detectores de segredo (gitleaks).
const TOKEN = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIn0', 'c2lnbmF0dXJh'].join('.');

function memoria() {
  const linhas: string[] = [];
  const destino = new Writable({
    write(pedaco: Buffer, _codificacao, concluir) {
      linhas.push(pedaco.toString());
      concluir();
    },
  });
  const registros = () => linhas.map((linha) => JSON.parse(linha) as Record<string, unknown>);
  return { destino, linhas, registros };
}

describe('criarLogger', () => {
  const nivelOriginal = process.env.LOG_LEVEL;
  afterEach(() => {
    if (nivelOriginal === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = nivelOriginal;
  });

  it('emite JSON com módulo, nível, horário e mensagem', () => {
    const { destino, registros } = memoria();
    criarLogger('prazos', { destino }).info('prazo calculado');

    expect(registros()[0]).toMatchObject({
      modulo: 'prazos',
      level: 'info',
      msg: 'prazo calculado',
    });
    expect(registros()[0]?.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('nunca escreve CPF, senha ou token, em nenhuma forma de chamada', () => {
    const { destino, linhas } = memoria();
    const logger = criarLogger('identidade', { destino });

    logger.info(
      { usuario: { cpf: CPF, senha: SENHA }, headers: { authorization: `Bearer ${TOKEN}` } },
      'login',
    );
    logger.warn(`tentativa com cpf ${CPF} e token ${TOKEN}`);
    logger.info('cpf %s', CPF);
    logger.error(new Error(`falha para ${CPF}`));
    logger.error(new Error(`token ${TOKEN}`), 'erro ao renovar sessão');
    // Texto livre só é filtrado por padrões reconhecíveis (CPF, JWT, Bearer); segredos em campos
    // nomeados são removidos pelo nome, inclusive dentro do erro e da causa.
    logger.error({
      err: Object.assign(new Error('senha recusada', { cause: { senha: SENHA } }), {
        senha: SENHA,
      }),
    });

    const saida = linhas.join('\n');
    expect(linhas).toHaveLength(6);
    for (const sensivel of [CPF, SENHA, TOKEN, '12345678909']) {
      expect(saida).not.toContain(sensivel);
    }
    expect(saida).toContain(MARCADOR_REMOVIDO);
  });

  it('registra o erro com tipo, mensagem e stack sanitizados', () => {
    const { destino, registros } = memoria();
    criarLogger('captura', { destino }).error(new TypeError(`cpf ${CPF}`));

    const [registro] = registros();
    expect(registro).toMatchObject({
      msg: `cpf ${MARCADOR_REMOVIDO}`,
      err: { type: 'TypeError', message: `cpf ${MARCADOR_REMOVIDO}` },
    });
    expect(JSON.stringify(registro)).toContain('stack');
  });

  it('inclui requestId, tenantId, userId e jobId do contexto da execução', () => {
    const { destino, registros } = memoria();
    const logger = criarLogger('fila', { destino });

    executarComContexto(
      { requestId: 'req-1', tenantId: 't-1', userId: 'u-1', jobId: 'j-1' },
      () => {
        logger.info('processando');
      },
    );

    expect(registros()[0]).toMatchObject({
      requestId: 'req-1',
      tenantId: 't-1',
      userId: 'u-1',
      jobId: 'j-1',
    });
  });

  it('inclui trace_id e span_id quando há span ativo', () => {
    const { destino, registros } = memoria();
    const logger = criarLogger('api', { destino });
    // Sem gerenciador de contexto registrado, context.with não propaga nada.
    new NodeTracerProvider().register();
    const spanContext = {
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: TraceFlags.SAMPLED,
    };

    context.with(trace.setSpanContext(context.active(), spanContext), () => {
      logger.info('com trace');
    });
    logger.info('sem trace');
    trace.disable();
    context.disable();
    propagation.disable();

    expect(registros()[0]).toMatchObject({
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
    });
    expect(registros()[1]).not.toHaveProperty('trace_id');
  });

  it('usa o nível do ambiente e ignora valores inválidos', () => {
    const { destino, registros } = memoria();
    process.env.LOG_LEVEL = 'warn';
    const logger = criarLogger('config', { destino });
    logger.info('descartado');
    logger.warn('mantido');
    expect(registros().map((registro) => registro.msg)).toEqual(['mantido']);

    process.env.LOG_LEVEL = 'verboso';
    expect(criarLogger('config').level).toBe('info');
    expect(criarLogger('config', { nivel: 'debug' }).level).toBe('debug');
  });
});
