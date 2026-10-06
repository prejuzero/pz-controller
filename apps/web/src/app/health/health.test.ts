import { describe, expect, it } from 'vitest';

import { GET as live } from './live/route';
import { GET as ready } from './ready/route';

describe('/health', () => {
  it.each([live, ready])('responde ok sem cache', async (rota) => {
    const resposta = rota();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('cache-control')).toBe('no-store');
    expect(await resposta.json()).toEqual({ status: 'ok' });
  });
});
