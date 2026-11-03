import { gerarUuidV7 } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { recursoDoEnvioExiste } from './recurso-do-envio.js';

import type { Uuid } from '@pz/kernel';

// Ids FICTÍCIOS (HU32).
const PRAZO = gerarUuidV7();
const PUBLICACAO = gerarUuidV7();
const RELATORIO = gerarUuidV7();
const ANA = gerarUuidV7();
const BETO = gerarUuidV7();

const busca = <T>(id: Uuid, valor: T) => ({
  buscar: (_tx: unknown, pedido: Uuid) => Promise.resolve(pedido === id ? valor : undefined),
});

describe('recurso do envio manual (HU32)', () => {
  it('prazo e publicação do tenant; relatório só de quem pediu', async () => {
    const existe = recursoDoEnvioExiste({
      prazos: busca(PRAZO, {}),
      publicacoes: busca(PUBLICACAO, {}),
      relatorios: busca(RELATORIO, { usuarioId: ANA }),
    });
    expect(await existe(undefined, 'prazo', PRAZO, ANA)).toBe(true);
    expect(await existe(undefined, 'prazo', PUBLICACAO, ANA)).toBe(false);
    expect(await existe(undefined, 'publicacao', PUBLICACAO, ANA)).toBe(true);
    expect(await existe(undefined, 'publicacao', PRAZO, ANA)).toBe(false);
    expect(await existe(undefined, 'relatorio', RELATORIO, ANA)).toBe(true);
    expect(await existe(undefined, 'relatorio', RELATORIO, BETO)).toBe(false);
    expect(await existe(undefined, 'relatorio', PRAZO, ANA)).toBe(false);
  });
});
