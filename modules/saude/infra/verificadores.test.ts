import { createServer as criarServidorHttp } from 'node:http';
import { createServer } from 'node:net';

import { describe, expect, it } from 'vitest';

import { VerificadorHttp, VerificadorTcp } from './verificadores.js';

import type { AddressInfo } from 'node:net';

async function portaTcpAberta(): Promise<{ porta: number; fechar: () => Promise<void> }> {
  const servidor = createServer((conexao) => conexao.end());
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  return {
    porta: (servidor.address() as AddressInfo).port,
    fechar: () =>
      new Promise((resolver) =>
        servidor.close(() => {
          resolver();
        }),
      ),
  };
}

async function servidorHttp(status: number): Promise<{ url: string; fechar: () => Promise<void> }> {
  const servidor = criarServidorHttp((_, resposta) => resposta.writeHead(status).end('corpo'));
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  return {
    url: `http://127.0.0.1:${String((servidor.address() as AddressInfo).port)}/`,
    fechar: () =>
      new Promise((resolver) =>
        servidor.close(() => {
          resolver();
        }),
      ),
  };
}

describe('VerificadorTcp', () => {
  it('passa quando a porta aceita conexão e falha quando recusa', async () => {
    const { porta, fechar } = await portaTcpAberta();
    await new VerificadorTcp('banco', `postgresql://u:s@127.0.0.1:${String(porta)}/db`).verificar();
    await fechar();

    await expect(
      new VerificadorTcp('banco', `postgresql://u:s@127.0.0.1:${String(porta)}/db`).verificar(),
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('usa a porta padrão do protocolo e recusa protocolo desconhecido', () => {
    expect(() => new VerificadorTcp('redis', 'redis://127.0.0.1')).not.toThrow();
    expect(() => new VerificadorTcp('x', 'ftp://127.0.0.1')).toThrow('porta desconhecida');
  });
});

describe('VerificadorHttp', () => {
  it('aceita respostas sem erro de servidor, inclusive 403 do S3 sem credencial', async () => {
    for (const status of [200, 403]) {
      const { url, fechar } = await servidorHttp(status);
      await new VerificadorHttp('armazenamento', url).verificar();
      await fechar();
    }
  });

  it('falha com erro de servidor', async () => {
    const { url, fechar } = await servidorHttp(503);
    await expect(new VerificadorHttp('armazenamento', url).verificar()).rejects.toThrow('503');
    await fechar();
  });
});
