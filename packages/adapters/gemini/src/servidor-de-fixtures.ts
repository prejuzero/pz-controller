import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';

/**
 * Servidor local que responde como a API do Gemini (`/v1beta`) a partir de fixtures no formato
 * observado em 06/11/2026 (conteúdo FICTÍCIO). Só para testes: o CI nunca acessa a rede externa.
 * Prefixos simulam falhas: `/limite` (429), `/credencial` (403), `/invalida` (saída fora do
 * schema) e `/sobrecarga` (503 "alta demanda").
 */
const fixture = (nome: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${nome}`, import.meta.url)), 'utf8'));

export interface ServidorDeFixtures {
  readonly url: string;
  /** Corpos das requisições de generateContent e o cabeçalho da chave, para conferência. */
  readonly requisicoes: { corpo: Record<string, unknown>; chave: string | undefined }[];
  encerrar(): Promise<void>;
}

const erro = (codigo: number, status: string) => ({
  error: { code: codigo, message: status, status },
});

function rotear(
  metodo: string | undefined,
  caminho: string,
  corpo: Buffer,
  chave: string | undefined,
  requisicoes: ServidorDeFixtures['requisicoes'],
): [number, unknown] {
  if (caminho.startsWith('/limite/')) return [429, erro(429, 'RESOURCE_EXHAUSTED')];
  if (caminho.startsWith('/credencial/')) return [403, erro(403, 'PERMISSION_DENIED')];
  if (caminho.startsWith('/sobrecarga/')) return [503, erro(503, 'UNAVAILABLE')];
  const rota = caminho.replace(/^\/invalida/, '');
  if (rota === '/v1beta/models' && metodo === 'GET') return [200, fixture('modelos.json')];
  if (/^\/v1beta\/models\/[^/]+:generateContent$/.test(rota) && metodo === 'POST') {
    requisicoes.push({
      corpo: JSON.parse(corpo.toString('utf8')) as Record<string, unknown>,
      chave,
    });
    const invalida = caminho.startsWith('/invalida/');
    return [200, fixture(invalida ? 'resposta-fora-do-schema.json' : 'resposta-valida.json')];
  }
  return [404, erro(404, 'NOT_FOUND')];
}

export async function subirServidorDeFixtures(): Promise<ServidorDeFixtures> {
  const requisicoes: ServidorDeFixtures['requisicoes'] = [];
  const servidor: Server = createServer((pedido, resposta) => {
    const partes: Buffer[] = [];
    pedido.on('data', (parte: Buffer) => partes.push(parte));
    pedido.on('end', () => {
      const chave = pedido.headers['x-goog-api-key'];
      const [status, corpo] = rotear(
        pedido.method,
        new URL(pedido.url ?? '/', 'http://localhost').pathname,
        Buffer.concat(partes),
        typeof chave === 'string' ? chave : undefined,
        requisicoes,
      );
      resposta.writeHead(status, { 'content-type': 'application/json' });
      resposta.end(JSON.stringify(corpo));
    });
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  const endereco = servidor.address();
  if (endereco === null || typeof endereco === 'string') throw new Error('servidor sem porta');
  return {
    url: `http://127.0.0.1:${String(endereco.port)}`,
    requisicoes,
    encerrar: () =>
      new Promise((pronto, falhou) => {
        servidor.close((e) => {
          if (e === undefined) pronto();
          else falhou(e);
        });
      }),
  };
}
