import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import { IngerirCaptura } from '../application/ingestao.js';

import type {
  NovoDestinatario,
  PublicacaoParaRegistrar,
  RepositorioDePublicacoes,
} from '../application/portas.js';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Publicações FICTÍCIAS.
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const TENANT = gerarUuidV7();
const OAB = gerarUuidV7();
const PROCESSO = gerarUuidV7();

class Repositorio implements RepositorioDePublicacoes<TransacaoEmMemoria> {
  readonly conteudos = new Map<string, Uuid>();
  readonly destinatarios: NovoDestinatario[] = [];
  registrarConteudo(_tx: TransacaoEmMemoria, p: PublicacaoParaRegistrar) {
    const chave = `${p.fonte}:${p.hashConteudo}`;
    const existente = this.conteudos.get(chave);
    if (existente !== undefined)
      return Promise.resolve({ conteudoId: existente, capturadoEm: new Date(0), novo: false });
    this.conteudos.set(chave, p.id);
    return Promise.resolve({ conteudoId: p.id, capturadoEm: new Date(0), novo: true });
  }
  registrarDestinatario(_tx: TransacaoEmMemoria, d: NovoDestinatario) {
    if (this.destinatarios.some((x) => x.tenantId === d.tenantId && x.conteudoId === d.conteudoId))
      return Promise.resolve(false);
    this.destinatarios.push(d);
    return Promise.resolve(true);
  }
}

const publicacao = (hash: string, numeroCnj?: string) => ({
  idExterno: hash.slice(0, 4),
  hashConteudo: hash.repeat(64 / hash.length),
  dataDisponibilizacao: '2026-10-06',
  teor: 'FICTÍCIO',
  ...(numeroCnj === undefined ? {} : { numeroCnj }),
  urlFonte: 'https://exemplo.invalid/certidao',
  metadados: {},
});
const evento = (tipo: 'oab' | 'processo', publicacoes: unknown[]) => ({
  tenantId: TENANT,
  payload: {
    alvoId: gerarUuidV7(),
    tipo,
    valor: 'x',
    referencias: [tipo === 'oab' ? OAB : PROCESSO],
    janela: {},
    fonte: 'djen',
    publicacoes,
  },
});

let repo: Repositorio;
let outbox: OutboxEmMemoria;
let criados: string[];
let ingerir: IngerirCaptura<TransacaoEmMemoria>;

beforeEach(() => {
  repo = new Repositorio();
  outbox = new OutboxEmMemoria();
  criados = [];
  ingerir = new IngerirCaptura(
    repo,
    (_t, numero) => {
      criados.push(numero);
      return Promise.resolve(PROCESSO);
    },
    outbox,
    relogio,
    (fonte) => `${fonte}@1.0.0`,
  );
});

const eventos = () => outbox.executar((tx) => outbox.reservarPendentes(tx, 100));

describe('ingestão (HU18)', () => {
  it('OAB: conteúdo novo e destinatário com processo encontrado ou criado; repetir não duplica', async () => {
    const e = evento('oab', [publicacao('a', '1000004-06.2026.8.26.0100'), publicacao('b')]);
    expect(await outbox.executar((tx) => ingerir.executar(tx, e))).toEqual({
      novas: 2,
      recebidas: 2,
    });
    expect(await outbox.executar((tx) => ingerir.executar(tx, e))).toEqual({
      novas: 0,
      recebidas: 0,
    });
    expect(criados).toEqual(['10000040620268260100', '10000040620268260100']);
    expect(repo.destinatarios.map((d) => [d.oabId, d.processoId])).toEqual([
      [OAB, PROCESSO],
      [OAB, null],
    ]);
    expect((await eventos()).map((x) => x.tipo)).toEqual([
      'PublicacaoNova',
      'PublicacaoRecebida',
      'PublicacaoNova',
      'PublicacaoRecebida',
    ]);
  });

  it('processo: usa o processo monitorado, sem criar outro', async () => {
    await outbox.executar((tx) =>
      ingerir.executar(tx, evento('processo', [publicacao('c', '1000004-06.2026.8.26.0100')])),
    );
    expect(criados).toEqual([]);
    expect(repo.destinatarios[0]).toMatchObject({ processoId: PROCESSO, oabId: null });
  });

  it('evento fora do formato lança (vai para a DLQ)', async () => {
    await expect(
      outbox.executar((tx) => ingerir.executar(tx, { tenantId: 'x' })),
    ).rejects.toThrow();
  });
});
