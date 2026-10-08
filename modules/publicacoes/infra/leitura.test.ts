import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsultarPublicacao, ListarPublicacoes, MarcarComoLida } from '../application/leitura.js';

import type {
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
});
