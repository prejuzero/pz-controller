import { Inject, Injectable } from '@nestjs/common';
import { Banco, BancoSistema } from '@pz/db';

import { BANCO, BANCO_SISTEMA } from './fichas.js';

import type { OnApplicationShutdown } from '@nestjs/common';

/** Fecha as conexões com o banco no desligamento (depois das filas e do relay). */
@Injectable()
export class RecursosDoBanco implements OnApplicationShutdown {
  constructor(
    @Inject(BANCO) private readonly banco: Banco,
    @Inject(BANCO_SISTEMA) private readonly sistema: BancoSistema,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.banco.encerrar(), this.sistema.encerrar()]);
  }
}
