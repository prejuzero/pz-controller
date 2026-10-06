import { describe, expect, it } from 'vitest';

import { cn } from './utilitarios.js';

describe('cn', () => {
  it('junta classes e resolve conflitos do Tailwind pela última', () => {
    expect(cn('px-2 text-sm', false, 'px-4')).toBe('text-sm px-4');
  });
});
