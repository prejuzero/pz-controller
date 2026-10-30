import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  BuscarPublicacoes,
  ConsultarPublicacao,
  ContarPublicacoesNovas,
  ListarPublicacoes,
  MarcarComoLida,
} from '../application/leitura.js';

import type {
  FiltroDaBuscaDePublicacoes,
  FiltroDePublicacoes,
  PublicacaoDoTenant,
  RepositorioDeLeitura,
} from '../application/portas.js';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Publicações FICTÍCIAS.
const ids = [gerarUuidV7(), gerarUuidV7(), gerarUuidV7()].sort().reverse() as [Uuid, Uuid, Uuid];
const [PRIMEIRO] = ids;
const pub = (id: Uuid): PublicacaoDoTenant => ({
  id,
  fonte: 'djen',
  idExterno: '1',
  numeroCnj: null,
  dataDisponibilizacao: '2026-10-06',
  teor: 'FICTÍCIO',
  urlFonte: 'https://exemplo.invalid',
  processoId: null,
  oabId: null,
  recebidaEm: new Date(0),
  capturadoEm: new Date(0),
  lidaEm: null,
  lidaPor: null,
  siglaTribunal: null,
  tipoComunicacao: null,
});

class Leitura implements RepositorioDeLeitura<TransacaoEmMemoria> {
  readonly filtros: FiltroDePublicacoes[] = [];
  readonly lidas = new Set<string>();
  listar(_tx: TransacaoEmMemoria, f: FiltroDePublicacoes) {
    this.filtros.push(f);
    return Promise.resolve(
      ids
        .filter((id) => f.antesDe === undefined || id < f.antesDe)
        .slice(0, f.limite)
        .map(pub),
    );
  }
  buscar(_tx: TransacaoEmMemoria, id: Uuid) {
    return Promise.resolve(ids.includes(id) ? pub(id) : undefined);
  }
  buscarComFiltros(_tx: TransacaoEmMemoria, f: FiltroDaBuscaDePublicacoes) {
    return Promise.resolve(ids.slice(0, f.limite).map(pub));
  }
  contarNaBusca(_tx: TransacaoEmMemoria, _f: FiltroDaBuscaDePublicacoes, teto: number) {
    return Promise.resolve(Math.min(this.total, teto));
  }
  conteudosComTexto(_tx: TransacaoEmMemoria, _texto: string, limite: number) {
    return Promise.resolve(Array.from({ length: Math.min(this.total, limite) }, () => ids[0]));
  }
  total = 3;
  contarNovas() {
    return Promise.resolve(ids.filter((id) => !this.lidas.has(id)).length);
  }
  marcarLida(_tx: TransacaoEmMemoria, id: Uuid) {
    const nova = !this.lidas.has(id);
    this.lidas.add(id);
    return Promise.resolve(nova);
  }
}

describe('leitura de publicações (HU18)', () => {
  it('pagina do mais novo para o mais antigo com cursor opaco e repassa os filtros', async () => {
    const repo = new Leitura();
    const listar = new ListarPublicacoes(new OutboxEmMemoria(), repo);
    const primeira = await listar.executar({
      limite: '2',
      novas: 'true',
      de: '2026-10-01',
      ate: '2026-10-31',
      processoId: ids[0],
    });
    if (!primeira.ok) throw primeira.erro;
    expect(primeira.valor.itens.map((p) => p.id)).toEqual(ids.slice(0, 2));
    expect(repo.filtros[0]).toMatchObject({
      limite: 3,
      novas: true,
      de: '2026-10-01',
      ate: '2026-10-31',
    });
    const segunda = await listar.executar({ cursor: primeira.valor.proximoCursor ?? '' });
    expect(segunda.ok && segunda.valor).toMatchObject({ proximoCursor: null });
    expect((await listar.executar({ cursor: 'invalido' })).ok).toBe(false);
    expect((await listar.executar({ limite: '0' })).ok).toBe(false);
  });

  it('detalhe e lida: inexistente é 404; trilha só na primeira leitura', async () => {
    const repo = new Leitura();
    const unidade = new OutboxEmMemoria();
    const consultar = new ConsultarPublicacao(unidade, repo);
    expect((await consultar.executar(PRIMEIRO)).ok).toBe(true);
    expect((await consultar.executar(gerarUuidV7())).ok).toBe(false);
    const trilha: string[] = [];
    const marcar = new MarcarComoLida(
      unidade,
      repo,
      { registrar: (_tx, e) => Promise.resolve(void trilha.push(e.tipo)) },
      new FixedClock(Instant.deIso('2026-10-07T12:00:00Z')),
    );
    const leitor = { usuarioId: gerarUuidV7(), canal: 'portal' as const };
    await marcar.executar(leitor, PRIMEIRO);
    await marcar.executar(leitor, PRIMEIRO);
    expect(trilha).toEqual(['publicacoes.publicacao-lida']);
    expect((await marcar.executar(leitor, gerarUuidV7())).ok).toBe(false);
  });

  it('conta as novas (não lidas) para o dashboard (HU26)', async () => {
    const repo = new Leitura();
    const contar = new ContarPublicacoesNovas(new OutboxEmMemoria(), repo);
    expect(await contar.executar()).toBe(3);
    repo.lidas.add(ids[0]);
    expect(await contar.executar()).toBe(2);
  });

  it('busca (HU28): página com cursor, teto da contagem e do filtro por teor', async () => {
    const repo = new Leitura();
    const buscar = new BuscarPublicacoes(new OutboxEmMemoria(), repo);
    const r = await buscar.executar({ ordem: 'desc', limite: 2 });
    expect(r.itens).toHaveLength(2);
    expect(r.ultimo).toEqual({ data: r.itens[1]?.dataDisponibilizacao, id: ids[1] });
    expect(r).toMatchObject({ totalAproximado: 3, totalLimitado: false });
    expect((await buscar.executar({ ordem: 'asc', limite: 5 })).ultimo).toBeNull();
    expect(await buscar.conteudosComTexto('x')).toHaveLength(3);
    repo.total = 20_000;
    expect(await buscar.executar({ ordem: 'desc', limite: 1 })).toMatchObject({
      totalAproximado: 1000,
      totalLimitado: true,
    });
    expect(await buscar.conteudosComTexto('x')).toBeUndefined();
  });
});
