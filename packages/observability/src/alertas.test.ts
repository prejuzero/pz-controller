import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LIMITES_LATENCIA_HTTP_SEGUNDOS } from './telemetria.js';

// Aceite da HU40 (PZ-232): cada alerta aponta para um runbook que existe. Os alertas são
// código (provisionamento do Grafana) e os runbooks são Markdown: este teste amarra os dois.
const RAIZ = join(import.meta.dirname, '..', '..', '..');
const alertas = readFileSync(
  join(RAIZ, 'infra/docker/observabilidade/provisionamento/alertas.yaml'),
  'utf8',
);
const runbook = readFileSync(join(RAIZ, 'docs/runbooks/alertas.md'), 'utf8');

/** Âncora no estilo do GitHub: minúsculas, sem pontuação, espaços viram hífen. */
const ancora = (titulo: string) =>
  titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-');
const ancoras = new Set([...runbook.matchAll(/^#{2,3} (.+)$/gm)].map((m) => ancora(m[1] ?? '')));
// Regras de alerta: blocos com título (os pontos de contato também têm uid, mas não título).
const regras = alertas
  .split(/\n {6}- uid: /)
  .slice(1)
  .filter((bloco) => /\n {8}title: /.test(bloco))
  .map((bloco) => ({
    uid: bloco.split('\n')[0] ?? '',
    runbook: /runbook_url: '[^'#]+#([^']+)'/.exec(bloco)?.[1],
  }));

describe('alertas como código (HU40)', () => {
  it('há alertas de SLO para disponibilidade e latência', () => {
    expect(regras.map((r) => r.uid)).toEqual(
      expect.arrayContaining([
        'pz-slo-disponibilidade-rapido',
        'pz-slo-disponibilidade-lento',
        'pz-slo-latencia-leitura-rapido',
        'pz-slo-latencia-escrita-lento',
      ]),
    );
  });

  it.each(regras)('$uid aponta para um runbook existente', ({ runbook: secao }) => {
    expect(secao).toBeDefined();
    expect(ancoras).toContain(secao);
  });

  it('os limites de latência dos alertas existem nos buckets do histograma HTTP', () => {
    const limites = [...alertas.matchAll(/le="([0-9.]+)"/g)].map((m) => Number(m[1]));
    expect(limites.length).toBeGreaterThan(0);
    for (const limite of limites) expect(LIMITES_LATENCIA_HTTP_SEGUNDOS).toContain(limite);
  });
});
