import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  INTERVALO_ENTRE_TENTATIVAS_MS,
  LOTE_DAS_FALHAS,
  ReprocessarFalhasDaIa,
} from '../application/reprocessar-falhas.js';

import type { ClassificadorIa } from '../application/classificar-publicacao.js';
import type { RepositorioDeFalhasDaIa } from '../application/reprocessar-falhas.js';
import type { Classificacao, RespostaDaIa } from '../domain/decisao.js';
import type { Instant as InstantT, TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Teores, tenants e taxonomia FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-11-13T23:00:00Z'));
const TENANT = gerarUuidV7(relogio);
const TEOR = 'Fica a parte intimada para apresentar contrarrazões. FICTÍCIO.';

class FalhasEmMemoria implements RepositorioDeFalhasDaIa<TransacaoEmMemoria> {
  readonly linhas = new Map<string, { classificacao: Classificacao; tentadaEm?: InstantT }>();
  pendentes(_tx: TransacaoEmMemoria, antesDe: InstantT, limite: number): Promise<Uuid[]> {
    return Promise.resolve(
      [...this.linhas]
        .filter(
          ([, l]) =>
            l.classificacao.motivo === 'saida-invalida' &&
            (l.tentadaEm === undefined || l.tentadaEm.ehAntesDe(antesDe)),
        )
        .map(([id]) => id as Uuid)
        .sort()
        .slice(0, limite),
    );
  }
  substituir(_tx: TransacaoEmMemoria, id: Uuid, c: Classificacao): Promise<boolean> {
    const l = this.linhas.get(id);
    if (l?.classificacao.motivo !== 'saida-invalida') return Promise.resolve(false);
    l.classificacao = c;
    return Promise.resolve(true);
  }
  registrarTentativa(_tx: TransacaoEmMemoria, id: Uuid, em: InstantT): Promise<void> {
    const l = this.linhas.get(id);
    if (l !== undefined) l.tentadaEm = em;
    return Promise.resolve();
  }
}

const FALHA: Classificacao = {
  origem: 'ia',
  situacao: 'revisao_manual',
  tipoAto: null,
  confianca: null,
  evidencias: [],
  prazoCitado: null,
  motivo: 'saida-invalida',
};
const OK: RespostaDaIa = {
  tipo: 'ok',
  tipoAto: 'contrarrazoes',
  confianca: 0.97,
  trecho: 'apresentar contrarrazões',
  versaoPrompt: 'v1',
  modelo: 'modelo-ficticio',
};

let falhas: FalhasEmMemoria;
let outbox: OutboxEmMemoria;
let tenantsDoConteudo: (id: Uuid) => Promise<Uuid[]>;
const montar = (respostas: RespostaDaIa[] | undefined) => {
  let chamada = 0;
  const ia: ClassificadorIa | undefined =
    respostas === undefined
      ? undefined
      : {
          classificar: () => {
            const r = respostas[Math.min(chamada++, respostas.length - 1)];
            return r === undefined ? Promise.reject(new Error('sem resposta')) : Promise.resolve(r);
          },
        };
  return new ReprocessarFalhasDaIa({
    sistema: outbox,
    noTenant: (_tenant, trabalho) => outbox.executar((tx) => trabalho(tx)),
    classificacao: {
      teores: { teor: () => Promise.resolve(TEOR) },
      regras: { vigentes: () => Promise.resolve([]) },
      taxonomia: {
        listar: () =>
          Promise.resolve([{ codigo: 'contrarrazoes', nome: 'Contrarrazões', descricao: '' }]),
      },
      ...(ia === undefined ? {} : { ia }),
    },
    falhas,
    tenantsDoConteudo,
    outbox,
    relogio,
  });
};

beforeEach(() => {
  falhas = new FalhasEmMemoria();
  outbox = new OutboxEmMemoria();
  tenantsDoConteudo = () => Promise.resolve([TENANT]);
});

describe('reprocessar as falhas da IA (13/11/2026)', () => {
  it('troca a falha pela nova classificação e publica PublicacaoClassificada', async () => {
    const id = gerarUuidV7(relogio);
    falhas.linhas.set(id, { classificacao: FALHA });
    expect(await montar([OK]).executar()).toEqual({
      reclassificadas: 1,
      aindaComFalha: 0,
      haMais: false,
    });
    expect(falhas.linhas.get(id)?.classificacao).toMatchObject({
      situacao: 'ok',
      tipoAto: 'contrarrazoes',
      modelo: 'modelo-ficticio',
    });
    expect(outbox.pendentes().map((e) => [e.tipo, e.tenantId, e.payload])).toEqual([
      [
        'PublicacaoClassificada',
        TENANT,
        expect.objectContaining({ conteudoId: id, tipoAto: 'contrarrazoes', situacao: 'ok' }),
      ],
    ]);
    // Já trocada: não volta.
    expect((await montar([OK]).executar()).reclassificadas).toBe(0);
  });

  it('a IA falha de novo: fica como está e só volta depois do intervalo', async () => {
    const id = gerarUuidV7(relogio);
    falhas.linhas.set(id, { classificacao: FALHA });
    const invalida: RespostaDaIa = { tipo: 'invalida' };
    expect(await montar([invalida]).executar()).toMatchObject({ aindaComFalha: 1 });
    expect(outbox.pendentes()).toEqual([]);
    expect((await montar([OK]).executar()).reclassificadas).toBe(0);
    relogio.avancarMs(INTERVALO_ENTRE_TENTATIVAS_MS + 1);
    expect((await montar([OK]).executar()).reclassificadas).toBe(1);
  });

  it('sem IA configurada, nada; sem destinatário, só registra a tentativa; lote cheio pede mais', async () => {
    falhas.linhas.set(gerarUuidV7(relogio), { classificacao: FALHA });
    expect(await montar(undefined).executar()).toEqual({
      reclassificadas: 0,
      aindaComFalha: 0,
      haMais: false,
    });
    tenantsDoConteudo = () => Promise.resolve([]);
    expect(await montar([OK]).executar()).toEqual({
      reclassificadas: 0,
      aindaComFalha: 0,
      haMais: false,
    });
    expect([...falhas.linhas.values()][0]?.tentadaEm).toBeDefined();

    falhas = new FalhasEmMemoria();
    tenantsDoConteudo = () => Promise.resolve([TENANT]);
    for (let i = 0; i < LOTE_DAS_FALHAS + 1; i++)
      falhas.linhas.set(gerarUuidV7(relogio), { classificacao: FALHA });
    expect(await montar([OK]).executar()).toMatchObject({
      reclassificadas: LOTE_DAS_FALHAS,
      haMais: true,
    });
  });
});
