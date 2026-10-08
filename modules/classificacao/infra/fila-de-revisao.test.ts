import { gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ListarRevisaoManual } from '../application/fila-de-revisao.js';

import { RevisaoManualEmMemoria } from './fila-de-revisao-em-memoria.js';

import type { ItemDaRevisaoManual } from '../application/fila-de-revisao.js';

const unidade = { executar: <T>(trabalho: (tx: unknown) => Promise<T>) => trabalho(undefined) };
const item = (): ItemDaRevisaoManual => ({
  conteudoId: gerarUuidV7(),
  origem: 'nenhuma',
  motivo: 'saida-invalida',
  tipoAto: null,
  confianca: null,
  evidencias: [],
  versaoPrompt: null,
  modelo: null,
  criadaEm: Instant.deIso('2026-10-08T12:00:00Z'),
});

describe('fila de revisão manual do curador (HU21)', () => {
  it('pagina por cursor, da classificação mais antiga para a mais nova', async () => {
    const fila = new RevisaoManualEmMemoria();
    // UUIDv7 do mesmo milissegundo não garante ordem: a fila segue a ordem dos ids.
    const [a, b, c] = [item(), item(), item()].sort((x, y) =>
      x.conteudoId.localeCompare(y.conteudoId),
    ) as [ItemDaRevisaoManual, ItemDaRevisaoManual, ItemDaRevisaoManual];
    fila.itens.push(c, a, b);
    const listar = new ListarRevisaoManual(unidade, fila);

    const primeira = await listar.executar({ limite: 2 });
    expect(primeira).toEqual({ itens: [a, b], proximoCursor: b.conteudoId });
    expect(await listar.executar({ limite: 2, apos: b.conteudoId })).toEqual({
      itens: [c],
      proximoCursor: null,
    });
  });

  it('fila vazia não tem próxima página', async () => {
    const listar = new ListarRevisaoManual(unidade, new RevisaoManualEmMemoria());
    expect(await listar.executar({ limite: 10 })).toEqual({ itens: [], proximoCursor: null });
  });
});
