import 'reflect-metadata';

import { UnsupportedMediaTypeException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';

import { registrarPainelDeFilas } from './admin/painel-de-filas.js';
import { AppModule } from './app.module.js';
import { registrarContextoDeRequisicao } from './http/contexto.js';
import { validacaoPorContrato } from './http/problemas.js';
import { origensPermitidas, registrarCabecalhosDeSeguranca } from './http/seguranca.js';
import { ROTA_DE_TOKEN } from './integracoes/integracoes.controller.js';

import type { OpcoesApi } from './app.module.js';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { RawServerDefault } from 'fastify';

/** Monta a api com a mesma configuração em produção e nos testes. */
export async function criarApi(opcoes: OpcoesApi): Promise<NestFastifyApplication> {
  const adaptador = new FastifyAdapter({
    trustProxy: true,
    bodyLimit: 1_048_576,
    // O padrão do Fastify (100) corta o código de verificação do histórico (101 caracteres, HU35).
    routerOptions: { maxParamLength: 200 },
  });
  registrarContextoDeRequisicao(adaptador.getInstance());
  registrarCabecalhosDeSeguranca(adaptador.getInstance(), {
    producao: opcoes.ambiente.NODE_ENV === 'production',
  });
  const api = await NestFactory.create<NestFastifyApplication>(
    AppModule.registrar(opcoes),
    adaptador,
    // Logs da api saem pelo @pz/observability; o logger interno do Nest fica desligado.
    // rawBody: a assinatura de webhook é verificada sobre os bytes exatos recebidos.
    { logger: false, abortOnError: false, rawBody: true },
  );
  // Corpo bruto preservado (assinatura de webhook) sem perder o parse padrão do Fastify, com a
  // proteção contra prototype poisoning. Texto puro: provedores como o SNS.
  const jsonPadrao = adaptador.getInstance().getDefaultJsonParser('error', 'error');
  api.useBodyParser<RawServerDefault>('application/json', {}, (requisicao, corpo, pronto) => {
    void jsonPadrao(requisicao, corpo.toString('utf8'), pronto);
  });
  api.useBodyParser('text/plain');
  // OAuth 2.1 (HU49): o endpoint de token recebe formulário (RFC 6749, seção 4.4.2). Só nele: um
  // formulário entre sites em qualquer outra rota pública seria CSRF sem preflight.
  api.useBodyParser<RawServerDefault>(
    'application/x-www-form-urlencoded',
    { bodyLimit: 16_384 },
    (requisicao, corpo, pronto) => {
      if (requisicao.url.split('?')[0] !== ROTA_DE_TOKEN) {
        pronto(new UnsupportedMediaTypeException());
        return;
      }
      pronto(null, Object.fromEntries(new URLSearchParams(corpo.toString('utf8'))));
    },
  );
  // Cadastro assistido por PDF (HU25): corpo binário até 10 MB, só nesta rota de tipo próprio.
  api.useBodyParser('application/pdf', { bodyLimit: 10 * 1024 * 1024 });
  api.useGlobalPipes(validacaoPorContrato);
  const origens = origensPermitidas(opcoes.ambiente.CORS_ORIGENS);
  if (origens.length > 0) api.enableCors({ origin: origens, credentials: true, maxAge: 600 });
  await registrarPainelDeFilas(api);
  api.enableShutdownHooks();
  return api;
}
