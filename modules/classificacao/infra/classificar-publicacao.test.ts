import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import { ClassificarPublicacao } from '../application/classificar-publicacao.js';

import type {
  ClassificadorIa,
  DependenciasDaClassificacao,
} from '../application/classificar-publicacao.js';
import type { Classificacao, RespostaDaIa } from '../domain/decisao.js';
import type { RegraRapida } from '../domain/regras.js';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Teores, regras e taxonomia FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-10-08T12:00:00Z'));
const TENANT = gerarUuidV7(relogio);
const CONTEUDO = gerarUuidV7(relogio);
const SENTENCA = gerarUuidV7(relogio);
const TEORES = new Map<string, string>([
  [CONTEUDO, 'Vistos. Cite-se o réu para contestar em 15 (quinze) dias.'],
  [SENTENCA, 'Ante o exposto, JULGO PROCEDENTE o pedido.'],
]);
const REGRA: RegraRapida = {
  codigo: 'r-citacao',
  versao: 1,
  tipoAto: 'citacao',
  padroes: ['\\bcite-se\\b'],
  confianca: 0.95,
};

class IaFalsa implements ClassificadorIa {
  chamadas = 0;
  constructor(private readonly respostas: RespostaDaIa[]) {}
  classificar(): Promise<RespostaDaIa> {
    const r = this.respostas[Math.min(this.chamadas, this.respostas.length - 1)];
    this.chamadas += 1;
    if (r === undefined) throw new Error('sem resposta roteirizada');
    return Promise.resolve(r);
  }
}

let gravadas: Map<string, Classificacao>;
let outbox: OutboxEmMemoria;
const montar = (ia?: ClassificadorIa, regras: RegraRapida[] = [REGRA]) => {
  const deps: DependenciasDaClassificacao<TransacaoEmMemoria> = {
    teores: { teor: (_tx, id) => Promise.resolve(TEORES.get(id)) },
    regras: { vigentes: () => Promise.resolve(regras) },
    taxonomia: {
      listar: () =>
        Promise.resolve([
          { codigo: 'citacao', nome: 'Citação', descricao: '' },
          { codigo: 'sentenca', nome: 'Sentença', descricao: '' },
        ]),
    },
    ...(ia === undefined ? {} : { ia }),
    classificacoes: {
      existe: (_tx, id) => Promise.resolve(gravadas.has(id)),
      gravar: (_tx, id, c) => {
        if (gravadas.has(id)) return Promise.resolve(false);
        gravadas.set(id, c);
        return Promise.resolve(true);
      },
    },
    outbox,
    relogio,
  };
  const caso = new ClassificarPublicacao(deps);
  return (conteudoId: Uuid) =>
    outbox.executar((tx) => caso.executar(tx, { tenantId: TENANT, payload: { conteudoId } }));
};
const eventos = async () => outbox.executar((tx) => outbox.reservarPendentes(tx, 10));

beforeEach(() => {
  gravadas = new Map();
  outbox = new OutboxEmMemoria();
});

describe('classificação de publicação nova (HU21, PZ-157)', () => {
  it('regra decide sem chamar a IA; evento uma vez; repetir não faz nada', async () => {
    const ia = new IaFalsa([{ tipo: 'invalida' }]);
    const classificar = montar(ia);
    expect(await classificar(CONTEUDO)).toMatchObject({ origem: 'regra', situacao: 'ok' });
    expect(await classificar(CONTEUDO)).toBeUndefined();
    expect(ia.chamadas).toBe(0);
    const [evento, ...outros] = await eventos();
    expect(outros).toEqual([]);
    expect(evento).toMatchObject({
      tipo: 'PublicacaoClassificada',
      tenantId: TENANT,
      agregadoId: CONTEUDO,
      payload: {
        conteudoId: CONTEUDO,
        origem: 'regra',
        situacao: 'ok',
        tipoAto: 'citacao',
        prazoCitado: {
          quantidade: 15,
          unidade: 'dias',
          unidadeImplicita: false,
          divergente: false,
        },
      },
    });
  });

  it('sem regra, a IA classifica', async () => {
    const ia = new IaFalsa([
      {
        tipo: 'ok',
        tipoAto: 'sentenca',
        confianca: 0.97,
        trecho: 'JULGO PROCEDENTE',
        versaoPrompt: 'classificar-ato@0.1.0',
        modelo: 'claude-haiku-4-5',
      },
    ]);
    expect(await montar(ia)(SENTENCA)).toMatchObject({
      origem: 'ia',
      situacao: 'ok',
      tipoAto: 'sentenca',
    });
    expect(ia.chamadas).toBe(1);
  });

  it('saída inválida: uma nova tentativa; inválida de novo vai para revisão manual', async () => {
    const ia = new IaFalsa([{ tipo: 'invalida' }]);
    expect(await montar(ia)(SENTENCA)).toMatchObject({ situacao: 'revisao_manual' });
    expect(ia.chamadas).toBe(2);
  });

  it('IA desligada: a confirmar; falha passageira da IA sobe (o job tenta de novo)', async () => {
    expect(await montar()(SENTENCA)).toMatchObject({
      situacao: 'a_confirmar',
      motivo: 'ia-desligada',
    });
    const quebrada: ClassificadorIa = {
      classificar: () => Promise.reject(new Error('provedor fora')),
    };
    gravadas = new Map();
    await expect(montar(quebrada)(SENTENCA)).rejects.toThrow('provedor fora');
    expect(gravadas.size).toBe(0);
  });

  it('outro processo gravou antes: a primeira vale e não há evento', async () => {
    const caso = new ClassificarPublicacao<TransacaoEmMemoria>({
      teores: { teor: () => Promise.resolve(TEORES.get(CONTEUDO)) },
      regras: { vigentes: () => Promise.resolve([REGRA]) },
      taxonomia: { listar: () => Promise.resolve([]) },
      // existe() ainda não via a linha; o gravar encontra (ON CONFLICT DO NOTHING).
      classificacoes: {
        existe: () => Promise.resolve(false),
        gravar: () => Promise.resolve(false),
      },
      outbox,
      relogio,
    });
    await outbox.executar((tx) =>
      caso.executar(tx, { tenantId: TENANT, payload: { conteudoId: CONTEUDO } }),
    );
    expect(await eventos()).toEqual([]);
  });

  it('regra mal cadastrada e conteúdo inexistente lançam', async () => {
    const quebrada = { ...REGRA, padroes: ['('] };
    await expect(montar(undefined, [quebrada])(CONTEUDO)).rejects.toThrow();
    await expect(montar()(gerarUuidV7(relogio))).rejects.toThrow('não encontrado');
  });
});
