import { ok, err, NaoEncontrado } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { fonteDaAgenda } from './agenda.js';

import type { Buscar } from '@pz/busca';
import type { ConsultarProcesso } from '@pz/cadastro';
import type { Uuid } from '@pz/kernel';
import type { ConsultarTabelaDePrazos } from '@pz/prazos';

// Prazos e processos FICTÍCIOS.
const EU = '01a10e00-0000-7000-8000-0000000000e1' as Uuid;
const OUTRO = '01a10e00-0000-7000-8000-0000000000e2';
const prazo = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  processoId: 'proc-1',
  tipoAto: 'contestacao',
  status: 'pendente',
  vencimento: '2027-03-24',
  responsavelId: null,
  ...extra,
});

describe('fonte da agenda pela busca, cadastro e taxonomia (HU50)', () => {
  it('meus e sem responsável, com nome do ato e processo; pagina; ignora sem data ou processo', async () => {
    const paginas = [
      {
        itens: [
          prazo('a', { responsavelId: EU }),
          prazo('b', { responsavelId: OUTRO }),
          prazo('c', { vencimento: null }),
          prazo('d', { processoId: 'proc-sumido' }),
        ],
        proximoCursor: 'c2',
      },
      {
        itens: [prazo('e', { status: 'a-confirmar', tipoAto: 'ato-sem-nome' })],
        proximoCursor: null,
      },
    ];
    const pedidos: unknown[] = [];
    const fonte = fonteDaAgenda({
      buscar: {
        prazos: (f: unknown) => {
          pedidos.push(f);
          return Promise.resolve(ok(paginas[pedidos.length - 1]));
        },
      } as unknown as Buscar,
      consultarProcesso: {
        executar: (id: string) =>
          Promise.resolve(
            id === 'proc-1'
              ? ok({ numeroCnj: '0000001-68.2026.8.26.0100', sigiloso: true })
              : err(new NaoEncontrado('x', 'x')),
          ),
      } as unknown as ConsultarProcesso<unknown>,
      tabela: {
        tiposDeAto: () => Promise.resolve([{ codigo: 'contestacao', nome: 'Contestação' }]),
      } as unknown as ConsultarTabelaDePrazos<unknown>,
      noTenant: (_t, trabalho) => trabalho(),
    });
    const prazos = await fonte.prazosAbertos({ tenantId: EU, usuarioId: EU });
    expect(prazos.map((p) => [p.id, p.nomeDoAto, p.status, p.sigiloso])).toEqual([
      ['a', 'Contestação', 'pendente', true],
      ['e', 'ato-sem-nome', 'a-confirmar', true],
    ]);
    expect(pedidos).toEqual([
      { statusPrazo: ['pendente', 'a-confirmar'], limite: 100 },
      { statusPrazo: ['pendente', 'a-confirmar'], limite: 100, cursor: 'c2' },
    ]);
  });

  it('erro da busca sobe (nada falha em silêncio)', async () => {
    const fonte = fonteDaAgenda({
      buscar: {
        prazos: () => Promise.resolve(err(new NaoEncontrado('falhou', 'falhou'))),
      } as unknown as Buscar,
      consultarProcesso: {} as ConsultarProcesso<unknown>,
      tabela: {
        tiposDeAto: () => Promise.resolve([]),
      } as unknown as ConsultarTabelaDePrazos<unknown>,
      noTenant: (_t, trabalho) => trabalho(),
    });
    await expect(fonte.prazosAbertos({ tenantId: EU, usuarioId: EU })).rejects.toThrow('falhou');
  });
});
