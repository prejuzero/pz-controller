import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { registrarContextoDeRequisicao } from './http/contexto.js';
import { validacaoPorContrato } from './http/problemas.js';

import type { OpcoesApi } from './app.module.js';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/** Monta a api com a mesma configuração em produção e nos testes. */
export async function criarApi(opcoes: OpcoesApi): Promise<NestFastifyApplication> {
  const adaptador = new FastifyAdapter({ trustProxy: true, bodyLimit: 1_048_576 });
  registrarContextoDeRequisicao(adaptador.getInstance());
  const api = await NestFactory.create<NestFastifyApplication>(
    AppModule.registrar(opcoes),
    adaptador,
    // Logs da api saem pelo @pz/observability; o logger interno do Nest fica desligado.
    { logger: false, abortOnError: false },
  );
  api.useGlobalPipes(validacaoPorContrato);
  api.enableShutdownHooks();
  return api;
}
