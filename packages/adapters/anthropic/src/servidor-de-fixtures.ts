import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';

/**
 * Servidor local que responde como a API de mensagens da Anthropic a partir de fixtures montadas
 * no formato documentado da API (conteúdo FICTÍCIO; ainda não gravadas de chamadas reais, que
 * exigem conta paga). Só para testes: o CI nunca acessa a rede externa. Prefixos simulam falhas:
 * `/limite` (429), `/credencial` (401) e `/invalida` (saída fora do schema).
 */
const fixture = (nome: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${nome}`, import.meta.url)), 'utf8'));

export interface ServidorDeFixtures {
  readonly url: string;
  /** Corpos das requisições a /v1/messages, para conferir o que o adaptador envia. */
  readonly requisicoes: Record<string, unknown>[];
  encerrar(): Promise<void>;
}

const erro = (tipo: string, mensagem: string) => ({
  type: 'error',
  error: { type: tipo, message: mensagem },
});

/** Status e corpo de cada rota simulada. */
function rotear(
  metodo: string | undefined,
  caminho: string,
  corpo: Buffer,
  requisicoes: Record<string, unknown>[],
): [number, unknown] {
  if (caminho.startsWith('/limite/')) return [429, erro('rate_limit_error', 'limite')];
  if (caminho.startsWith('/credencial/'))
    return [401, erro('authentication_error', 'chave inválida')];
  const rota = caminho.replace(/^\/invalida/, '');
  if (rota === '/v1/models' && metodo === 'GET') return [200, fixture('modelos.json')];
  if (rota === '/v1/messages' && metodo === 'POST') {
    requisicoes.push(JSON.parse(corpo.toString('utf8')) as Record<string, unknown>);
    const invalida = caminho.startsWith('/invalida/');
    return [200, fixture(invalida ? 'mensagem-fora-do-schema.json' : 'mensagem-valida.json')];
  }
  return [404, erro('not_found_error', 'rota inexistente')];
}

export async function subirServidorDeFixtures(): Promise<ServidorDeFixtures> {
  const requisicoes: Record<string, unknown>[] = [];
  const responder = (metodo: string | undefined, url: string | undefined, corpo: Buffer) =>
    rotear(metodo, new URL(url ?? '/', 'http://localhost').pathname, corpo, requisicoes);
  const servidor: Server = createServer((pedido, resposta) => {
    const json = (status: number, corpo: unknown) => {
      resposta.writeHead(status, { 'content-type': 'application/json' });
      resposta.end(JSON.stringify(corpo));
    };
    const partes: Buffer[] = [];
    pedido.on('data', (parte: Buffer) => partes.push(parte));
    pedido.on('end', () => {
      json(...responder(pedido.method, pedido.url, Buffer.concat(partes)));
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
