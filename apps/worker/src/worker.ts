import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module.js';

import type { OpcoesWorker } from './worker.module.js';
import type { INestApplicationContext } from '@nestjs/common';

/** Monta o worker (NestJS standalone) com a mesma configuração em produção e nos testes. */
export async function criarWorker(opcoes: OpcoesWorker): Promise<INestApplicationContext> {
  const worker = await NestFactory.createApplicationContext(WorkerModule.registrar(opcoes), {
    // Logs saem pelo @pz/observability; o logger interno do Nest fica desligado.
    logger: false,
    abortOnError: false,
  });
  return worker;
}
