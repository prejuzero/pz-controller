import { LocalDate, ok, err, Validacao } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsumidorDosLembretes } from './lembretes.js';
import { fontesDoResumo } from './resumo.js';

import type { ConsultarProcesso } from '@pz/cadastro';
import type { TenantsPostgres, UsuariosComPermissaoPostgres } from '@pz/identidade';
import type { EventoDominio, Uuid } from '@pz/kernel';
import type {
  AvisarNovaIntimacao,
  CancelarLembretes,
  ProgramarLembretes,
  RepositorioDeLembretes,
} from '@pz/notificacoes';
import type { BuscarPrazos } from '@pz/prazos';
import type { ListarPublicacoes } from '@pz/publicacoes';

// Só a ligação eventos → casos de uso e a montagem das fontes (a regra fica no módulo).
const PRAZO = '01a10e00-0000-7000-8000-0000000e0001';
const TENANT = '01a10e00-0000-7000-8000-0000000e0002' as Uuid;
const evento = (tipo: string, payload: unknown) =>
  ({ id: PRAZO, tipo, versao: 1, tenantId: TENANT, payload }) as unknown as EventoDominio;

describe('consumidor dos lembretes (HU31)', () => {
  it('programa, cancela, avisa a nova intimação e reprograma pela preferência', async () => {
    const chamadas: string[] = [];
    const consumidor = new ConsumidorDosLembretes(
      {
        executar: (_tx: unknown, _t: unknown, id: string) => {
          chamadas.push(`programar:${id}`);
          return Promise.resolve({ agendados: 2 });
        },
      } as unknown as ProgramarLembretes<never>,
      {
        executar: (_tx: unknown, id: string) => {
          chamadas.push(`cancelar:${id}`);
          return Promise.resolve(1);
        },
      } as unknown as CancelarLembretes<never>,
      {
        executar: (_tx: unknown, p: { origem: string }) => {
          chamadas.push(`avisar:${p.origem}`);
          return Promise.resolve('avisado');
        },
      } as unknown as AvisarNovaIntimacao<never>,
      {
        prazosDoUsuario: () => Promise.resolve([PRAZO, PRAZO]),
      } as unknown as RepositorioDeLembretes<never>,
    );
    const tx = {} as never;
    await consumidor.sugerido(tx, evento('PrazoSugerido', { prazoId: PRAZO, origem: 'djen' }));
    await consumidor.confirmado(tx, evento('PrazoConfirmado', { prazoId: PRAZO }));
    await consumidor.ajustado(tx, evento('PrazoAjustado', { prazoId: PRAZO }));
    await consumidor.recalculado(tx, evento('PrazoRecalculado', { prazoId: PRAZO }));
    await consumidor.cumprido(tx, evento('PrazoCumprido', { prazoId: PRAZO }));
    await consumidor.cancelado(tx, evento('PrazoCancelado', { prazoId: PRAZO }));
    await consumidor.preferencias(
      tx,
      evento('PreferenciasDeNotificacaoAlteradas', { usuarioId: PRAZO }),
    );
    expect(chamadas).toEqual([
      `programar:${PRAZO}`,
      'avisar:djen',
      `programar:${PRAZO}`,
      `programar:${PRAZO}`,
      `programar:${PRAZO}`,
      `cancelar:${PRAZO}`,
      `cancelar:${PRAZO}`,
      `programar:${PRAZO}`,
      `programar:${PRAZO}`,
    ]);
    await expect(async () =>
      consumidor.confirmado(tx, evento('PrazoConfirmado', {})),
    ).rejects.toThrow();
  });
});

describe('fontes do resumo diário (HU31)', () => {
  it('pagina os escritórios ativos e monta os itens com número e links', async () => {
    const pagina = (n: number, inicio: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `t-${String(inicio + i)}`,
        tipo: i === 0 ? 'plataforma' : 'escritorio',
        ...(i === 1 ? { encerradoEm: {} } : {}),
      }));
    let chamadasTenants = 0;
    const filtros: unknown[] = [];
    const fontes = fontesDoResumo({
      tenants: {
        listar: () => Promise.resolve(chamadasTenants++ === 0 ? pagina(500, 0) : pagina(3, 500)),
      } as unknown as TenantsPostgres,
      usuarios: { listar: () => Promise.resolve(['u']) } as unknown as UsuariosComPermissaoPostgres,
      prazos: {
        executar: (f: unknown) => {
          filtros.push(f);
          return Promise.resolve(
            ok({
              itens: [
                { id: 'p', processoId: 'x', vencimento: '2026-11-03' },
                { id: 'q', processoId: 'y', vencimento: null },
              ],
            }),
          );
        },
      } as unknown as BuscarPrazos<unknown>,
      publicacoes: {
        executar: () =>
          Promise.resolve(
            ok({
              itens: [
                { id: 'c', numeroCnj: '00000010920308090001' },
                { id: 'e', numeroCnj: null },
              ],
            }),
          ),
      } as unknown as ListarPublicacoes<unknown>,
      processos: {
        executar: (id: string) =>
          Promise.resolve(
            id === 'x' ? ok({ numeroCnj: '0000001-09.2030.8.09.0001' }) : err(new Error('x')),
          ),
      } as unknown as ConsultarProcesso<unknown>,
      urlDoPortal: 'https://app.exemplo.invalid',
    });
    const tenants = await fontes.tenants({});
    // Sem o tenant da plataforma nem os encerrados: 498 da primeira página e 1 da segunda.
    expect(tenants).toHaveLength(499);
    expect(await fontes.usuarios({})).toEqual(['u']);
    const c = await fontes.conteudo('u' as Uuid, LocalDate.de(2026, 11, 3));
    expect(c.vencemHoje).toEqual([
      {
        numeroProcesso: '0000001-09.2030.8.09.0001',
        vencimento: '03/11/2026',
        link: 'https://app.exemplo.invalid/prazos/p',
      },
      {
        numeroProcesso: 'sem número',
        vencimento: '',
        link: 'https://app.exemplo.invalid/prazos/q',
      },
    ]);
    expect(c.intimacoes).toEqual([
      {
        numeroProcesso: '0000001-09.2030.8.09.0001',
        link: 'https://app.exemplo.invalid/publicacoes/c',
      },
      { numeroProcesso: 'sem número', link: 'https://app.exemplo.invalid/publicacoes/e' },
    ]);
    expect(filtros).toHaveLength(3);

    const falha = fontesDoResumo({
      tenants: {} as TenantsPostgres,
      usuarios: {} as UsuariosComPermissaoPostgres,
      prazos: {
        executar: () => Promise.resolve(err(new Validacao([]))),
      } as unknown as BuscarPrazos<unknown>,
      publicacoes: {
        executar: () => Promise.resolve(ok({ itens: [] })),
      } as unknown as ListarPublicacoes<unknown>,
      processos: {} as ConsultarProcesso<unknown>,
      urlDoPortal: 'https://app.exemplo.invalid',
    });
    await expect(falha.conteudo('u' as Uuid, LocalDate.de(2026, 11, 3))).rejects.toThrow(Validacao);
    const semNovas = fontesDoResumo({
      tenants: {} as TenantsPostgres,
      usuarios: {} as UsuariosComPermissaoPostgres,
      prazos: {} as BuscarPrazos<unknown>,
      publicacoes: {
        executar: () => Promise.resolve(err(new Validacao([]))),
      } as unknown as ListarPublicacoes<unknown>,
      processos: {} as ConsultarProcesso<unknown>,
      urlDoPortal: 'https://app.exemplo.invalid',
    });
    await expect(semNovas.conteudo('u' as Uuid, LocalDate.de(2026, 11, 3))).rejects.toThrow(
      Validacao,
    );
  });
});
