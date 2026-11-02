import { err, LocalDate, ok, Validacao } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsultarAgenda } from './agenda.js';

import type { FontesDaAgenda } from './agenda.js';
import type { Buscar } from './buscar.js';
import type { Agenda } from '@pz/contracts';
import type { Instant, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS (HU27).
const P1 = '01a10e00-0000-7000-8000-0000000e0001' as Uuid;
const P2 = '01a10e00-0000-7000-8000-0000000e0002' as Uuid;
const ANA = '01a10e00-0000-7000-8000-0000000e0003' as Uuid;
const CLIENTE = '01a10e00-0000-7000-8000-0000000e0004' as Uuid;

const prazo = (id: string) => ({ id, vencimento: '2026-11-10' }) as Agenda['prazos'][number];
const compromisso = (id: string, dataHora: string, processoId: Uuid | null) =>
  ({ id, titulo: id, dataHora, processoId }) as Agenda['compromissos'][number];

function montar(paginas = 1, sobrescrever: Partial<FontesDaAgenda> = {}) {
  const pedidos: Record<string, unknown>[] = [];
  const janelas: [Instant, Instant][] = [];
  const jurisdicoes: unknown[] = [];
  const buscar = {
    prazos: (corpo: Record<string, unknown>) => {
      pedidos.push(corpo);
      const pagina = pedidos.length;
      return Promise.resolve(
        ok({
          itens: [prazo(`p${String(pagina)}`)],
          proximoCursor: pagina < paginas ? `c${String(pagina)}` : null,
          totalAproximado: paginas,
          totalLimitado: false,
        }),
      );
    },
  } as unknown as Buscar;
  const fontes: FontesDaAgenda = {
    processos: () => Promise.resolve(ok([P1])),
    compromissos: (de, ate) => {
      janelas.push([de, ate]);
      return Promise.resolve([
        // 31/10 23h em São Paulo (02:00Z de 01/11): fora do período.
        compromisso('antes', '2026-11-01T02:00:00.000Z', P1),
        compromisso('dentro', '2026-11-03T13:00:00.000Z', P1),
        compromisso('sem-processo', '2026-11-04T13:00:00.000Z', null),
        compromisso('outro-processo', '2026-11-05T13:00:00.000Z', P2),
        // 30/11 22h em São Paulo (01:00Z de 01/12): ainda dentro.
        compromisso('fim', '2026-12-01T01:00:00.000Z', P1),
      ]);
    },
    diasNaoUteis: (jurisdicao) => {
      jurisdicoes.push(jurisdicao);
      return Promise.resolve([]);
    },
    ...sobrescrever,
  };
  return { agenda: new ConsultarAgenda(buscar, fontes), pedidos, janelas, jurisdicoes };
}

const NOVEMBRO = { de: '2026-11-01', ate: '2026-11-30' };

describe('agenda do calendário (HU27)', () => {
  it('busca os prazos pelo vencimento no período, com os filtros globais', async () => {
    const { agenda, pedidos, jurisdicoes } = montar();
    const r = await agenda.executar({
      ...NOVEMBRO,
      responsavelId: ANA,
      tribunal: 'TJGO',
      clienteId: CLIENTE,
    });
    if (!r.ok) throw r.erro;
    expect(pedidos).toEqual([
      {
        responsavelId: ANA,
        tribunal: 'TJGO',
        clienteId: CLIENTE,
        periodo: { ...NOVEMBRO, campoData: 'vencimento' },
        limite: 100,
      },
    ]);
    expect(r.valor.prazosTruncados).toBe(false);
    expect(jurisdicoes).toEqual([{ tribunal: 'TJGO' }]);
  });

  it('segue o cursor e avisa quando o período tem prazos demais', async () => {
    const tres = montar(3);
    const r3 = await tres.agenda.executar(NOVEMBRO);
    if (!r3.ok) throw r3.erro;
    expect(r3.valor.prazos.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(tres.pedidos[1]).toMatchObject({ cursor: 'c1' });
    expect(r3.valor.prazosTruncados).toBe(false);

    const muitos = montar(99);
    const r = await muitos.agenda.executar(NOVEMBRO);
    if (!r.ok) throw r.erro;
    expect(r.valor.prazos).toHaveLength(5);
    expect(r.valor.prazosTruncados).toBe(true);
  });

  it('corta os compromissos pelo dia em São Paulo, não pelo dia em UTC', async () => {
    const { agenda, janelas, jurisdicoes } = montar();
    const r = await agenda.executar(NOVEMBRO);
    if (!r.ok) throw r.erro;
    expect(r.valor.compromissos.map((c) => c.id)).toEqual([
      'dentro',
      'sem-processo',
      'outro-processo',
      'fim',
    ]);
    expect(janelas[0]?.map((i) => i.paraIso())).toEqual([
      '2026-10-31T00:00:00.000Z',
      '2026-12-02T00:00:00.000Z',
    ]);
    expect(jurisdicoes).toEqual([{}]);
  });

  it('com tribunal ou cliente, só os compromissos dos processos do filtro', async () => {
    const { agenda } = montar();
    const r = await agenda.executar({ ...NOVEMBRO, clienteId: CLIENTE });
    if (!r.ok) throw r.erro;
    expect(r.valor.compromissos.map((c) => c.id)).toEqual(['dentro', 'fim']);
  });

  it('o filtro de advogado não esconde compromissos (não têm responsável)', async () => {
    const { agenda } = montar();
    const r = await agenda.executar({ ...NOVEMBRO, responsavelId: ANA });
    if (!r.ok) throw r.erro;
    expect(r.valor.compromissos).toHaveLength(4);
  });

  it('recusa período invertido, longo demais ou datas inválidas', async () => {
    const { agenda } = montar();
    for (const consulta of [
      { de: '2026-11-30', ate: '2026-11-01' },
      { de: '2026-11-01', ate: '2027-01-02' },
      { de: '2026-02-30', ate: '2026-03-01' },
      { de: '2026-11-01' },
      { ...NOVEMBRO, extra: 1 },
    ]) {
      const r = await agenda.executar(consulta);
      expect(r.ok, JSON.stringify(consulta)).toBe(false);
    }
    const limite = await agenda.executar({
      de: '2026-11-01',
      ate: LocalDate.de(2026, 11, 1).maisDias(61).paraIso(),
    });
    expect(limite.ok).toBe(true);
  });

  it('repassa os erros da busca e do cadastro', async () => {
    const falha = err(new Validacao([{ campo: 'x', mensagem: 'x' }]));
    const { agenda } = montar(1, { processos: () => Promise.resolve(falha) });
    expect((await agenda.executar({ ...NOVEMBRO, tribunal: 'TJGO' })).ok).toBe(false);

    const semBusca = new ConsultarAgenda(
      { prazos: () => Promise.resolve(falha) } as unknown as Buscar,
      {
        processos: () => Promise.resolve(ok([])),
        compromissos: () => Promise.resolve([]),
        diasNaoUteis: () => Promise.resolve([]),
      },
    );
    expect((await semBusca.executar(NOVEMBRO)).ok).toBe(false);
  });
});
