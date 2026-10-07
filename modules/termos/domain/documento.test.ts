import { Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { pendentes } from './documento.js';

import type { DocumentoLegal } from './documento.js';
import type { Uuid } from '@pz/kernel';

// Documentos FICTÍCIOS: só exercitam a regra de versões.
const doc = (id: string, tipo: DocumentoLegal['tipo'], versao: string, publicado: string) => ({
  id: id as Uuid,
  tipo,
  versao,
  conteudo: 'FICTÍCIO',
  publicadoEm: Instant.deIso(publicado),
});
const termos1 = doc('t1', 'termos', '1.0', '2026-09-01T12:00:00Z');
const termos2 = doc('t2', 'termos', '2.0', '2026-10-05T12:00:00Z');
const privacidade = doc('p1', 'privacidade', '1.0', '2026-09-01T12:00:00Z');
const todos = [termos1, termos2, privacidade];

describe('documentos pendentes (HU38)', () => {
  it('só a versão mais recente de cada tipo conta; aceitar a anterior não basta', () => {
    const ate = Instant.deIso('2026-10-07T12:00:00Z');
    expect(pendentes(todos, new Set(), ate).map((d) => d.id)).toEqual(['p1', 't2']);
    expect(pendentes(todos, new Set(['t1', 'p1'] as Uuid[]), ate).map((d) => d.id)).toEqual(['t2']);
    expect(pendentes(todos, new Set(['t2', 'p1'] as Uuid[]), ate)).toEqual([]);
  });

  it('versão publicada depois do início da sessão só vale no próximo login', () => {
    const inicioDaSessao = Instant.deIso('2026-10-01T12:00:00Z');
    expect(pendentes(todos, new Set(['t1', 'p1'] as Uuid[]), inicioDaSessao)).toEqual([]);
  });
});
