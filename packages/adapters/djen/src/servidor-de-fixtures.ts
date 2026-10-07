import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';

/**
 * Servidor local que responde como a API do DJEN a partir das fixtures gravadas (respostas reais
 * de 07/10/2026, anonimizadas: nomes, OAB, números de processo, teor e links fictícios). Só para
 * testes: o CI nunca acessa a rede externa. Prefixos simulam falhas: `/limite` (429 sempre),
 * `/instavel` (429 na primeira chamada, depois normal), `/fora` (503 sempre) e `/invalido`.
 */
const fixture = (nome: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../fixtures/${nome}`, import.meta.url)), 'utf8'),
  ) as {
    count: number;
    items: unknown[];
  };

export interface ServidorDeFixtures {
  readonly url: string;
  /** Consultas recebidas (todas, inclusive as que simulam falha): paginação, filtros e chamadas. */
  readonly consultas: URLSearchParams[];
  encerrar(): Promise<void>;
}

export async function subirServidorDeFixtures(): Promise<ServidorDeFixtures> {
  const porOab = fixture('oab.json');
  const porProcesso = fixture('processo.json');
  const consultas: URLSearchParams[] = [];
  let instavelJaRecusou = false;
  const servidor: Server = createServer((pedido, resposta) => {
    const url = new URL(pedido.url ?? '/', 'http://localhost');
    const q = url.searchParams;
    consultas.push(q);
    const json = (status: number, corpo: unknown, cabecalhos: Record<string, string> = {}) => {
      resposta.writeHead(status, { 'content-type': 'application/json', ...cabecalhos });
      resposta.end(JSON.stringify(corpo));
    };
    if (url.pathname.startsWith('/limite/')) {
      json(429, { message: 'Too Many Requests' }, { 'retry-after': '60' });
      return;
    }
    if (url.pathname.startsWith('/instavel/') && !instavelJaRecusou) {
      instavelJaRecusou = true;
      json(429, { message: 'Too Many Requests' });
      return;
    }
    if (url.pathname.startsWith('/fora/')) {
      json(503, { message: 'Service Unavailable' });
      return;
    }
    if (url.pathname.startsWith('/invalido/')) {
      json(200, { status: 'success', items: 'não é lista' });
      return;
    }
    const caminho = url.pathname.replace(/^\/instavel/, '');
    if (caminho !== '/api/v1/comunicacao') {
      json(404, { message: 'Not Found' });
      return;
    }
    const base =
      q.get('numeroOab') === '123456' && q.get('ufOab') === 'SP'
        ? porOab
        : q.get('numeroProcesso') === porProcessoNumero(porProcesso)
          ? porProcesso
          : { count: 0, items: [] };
    const pagina = Number(q.get('pagina') ?? '1');
    const tamanho = Number(q.get('itensPorPagina') ?? '100');
    json(200, {
      status: 'success',
      message: 'Sucesso',
      count: base.count,
      items: base.items.slice((pagina - 1) * tamanho, pagina * tamanho),
    });
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  const endereco = servidor.address();
  if (endereco === null || typeof endereco === 'string') throw new Error('Servidor sem porta');
  return {
    url: `http://127.0.0.1:${String(endereco.port)}`,
    consultas,
    encerrar: () =>
      new Promise<void>((fim, falha) => {
        servidor.close((erro) => {
          if (erro === undefined) fim();
          else falha(erro);
        });
      }),
  };
}

function porProcessoNumero(base: { items: unknown[] }): string {
  const [primeiro] = base.items as { numero_processo?: string }[];
  return primeiro?.numero_processo ?? '';
}
