import { LocalDate, ok } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsumidorDosPrazos } from './consumidor.js';
import { chaveDoLote } from './jobs.js';
import { processoNoCalendario } from './processo.js';

import type { Filas } from '../filas/runtime.js';
import type { ConsultarProcesso, ProcessoListado } from '@pz/cadastro';
import type { ConsultarDiasNaoUteis, Jurisdicao } from '@pz/calendario';
import type { EventoDominio, Uuid } from '@pz/kernel';
import type { TenantsAfetadosPeloCalendario } from '@pz/prazos';

// Dados FICTÍCIOS: só a ligação entre os módulos.
const EVENTO = '01a10e00-0000-7000-8000-00000000e001' as Uuid;
const PLATAFORMA = '01a10e00-0000-7000-8000-00000000f001' as Uuid;
const TENANT_A = '01a10e00-0000-7000-8000-00000000a001' as Uuid;
const TENANT_B = '01a10e00-0000-7000-8000-00000000b001' as Uuid;
const TENANTS = [TENANT_A, TENANT_B];
const payload = {
  eventoId: '01a10e00-0000-7000-8000-00000000e0aa',
  origem: 'global',
  acao: 'incluido',
  abrangencia: 'nacional',
  inicio: '2027-03-10',
  fim: '2027-03-10',
  usuarioId: '01a10e00-0000-7000-8000-00000000f0a1',
};

describe('ConsumidorDosPrazos (HU16)', () => {
  it('publica um job por tenant alcançado, com chave idempotente', async () => {
    const publicados: { escopo: unknown; chave: string; dados: unknown }[] = [];
    const filas = {
      publicar: (_definicao: unknown, dados: unknown, escopo: unknown, chave: string) => {
        publicados.push({ escopo, chave, dados });
        return Promise.resolve(chave);
      },
    } as unknown as Filas;
    const tenants = {
      executar: () => Promise.resolve(TENANTS),
    } as unknown as TenantsAfetadosPeloCalendario<unknown>;
    const consumidor = new ConsumidorDosPrazos(tenants, filas);
    await consumidor.calendarioAlterado('tx', {
      id: EVENTO,
      tipo: 'CalendarioAlterado',
      versao: 1,
      tenantId: PLATAFORMA,
      agregadoId: payload.eventoId,
      payload,
    } as unknown as EventoDominio);
    expect(publicados.map((p) => [p.escopo, p.chave])).toEqual(
      TENANTS.map((tenantId) => [{ tenantId }, `${EVENTO}-${tenantId}-inicio`]),
    );
    expect(publicados[0]?.dados).toEqual({
      evento: { id: EVENTO, tenantId: PLATAFORMA, payload },
      tenantId: TENANT_A,
      depoisDe: null,
    });
    const proximo = {
      evento: { id: EVENTO, tenantId: PLATAFORMA, payload },
      tenantId: TENANT_A,
      depoisDe: TENANT_B,
    };
    expect(chaveDoLote(proximo)).toBe(`${EVENTO}-${TENANT_A}-${TENANT_B}`);
  });
});

describe('processoNoCalendario (HU16)', () => {
  it('monta jurisdição, fuso e dias do processo pelas APIs do cadastro e do calendario', async () => {
    const pedidos: Jurisdicao[] = [];
    const processos = {
      executar: (id: Uuid) =>
        Promise.resolve(
          id === EVENTO
            ? ok({
                tribunal: 'TJAC',
                comarca: 'Comarca Fictícia',
                ramo: 'estadual',
              } as ProcessoListado)
            : { ok: false as const, erro: new Error('não encontrado') },
        ),
    } as unknown as ConsultarProcesso<unknown>;
    const dias = {
      diasNaoUteis: (jurisdicao: Jurisdicao, inicio: LocalDate) => {
        pedidos.push(jurisdicao);
        return Promise.resolve([
          {
            data: inicio,
            tipo: 'feriado' as const,
            motivo: 'FICTÍCIO',
            fonte: {
              origem: 'global' as const,
              eventoId: EVENTO,
              atoNormativo: 'Ato FICTÍCIO',
              urlAto: 'https://exemplo.invalid/ato',
            },
          },
        ]);
      },
    } as unknown as ConsultarDiasNaoUteis<unknown>;
    const localizar = processoNoCalendario(processos, dias);

    expect(await localizar(TENANT_A)).toBeUndefined();
    const processo = await localizar(EVENTO);
    expect(processo).toMatchObject({
      ramoDoTribunal: 'estadual',
      jurisdicao: { tribunal: 'TJAC', uf: 'AC', comarca: 'Comarca Fictícia' },
      lacunas: ['municipio'],
      fuso: { fuso: 'America/Rio_Branco', outrosFusos: false },
    });
    const data = LocalDate.de(2027, 3, 10);
    expect(await processo?.diasNaoUteis(data, data)).toEqual([
      {
        data,
        tipo: 'feriado',
        motivo: 'FICTÍCIO',
        atoNormativo: 'Ato FICTÍCIO',
        urlAto: 'https://exemplo.invalid/ato',
      },
    ]);
    expect(pedidos).toEqual([{ tribunal: 'TJAC', uf: 'AC', comarca: 'Comarca Fictícia' }]);
  });
});
