import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { AddressInfo } from 'node:net';

// Sobe o processo real como em produção (`node --import instrumentacao main`); o carregador do
// tsx só traduz TypeScript, no mesmo processo, para os sinais chegarem direto ao worker.
const raiz = fileURLToPath(new URL('..', import.meta.url));

async function portaLivre(): Promise<number> {
  const servidor = createServer();
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const { port } = servidor.address() as AddressInfo;
  await new Promise((resolver) => servidor.close(resolver));
  return port;
}

function subirProcesso(ambiente: Record<string, string>) {
  const argumentos = ['--import', 'tsx', '--import', './src/instrumentacao.ts', 'src/main.ts'];
  const processo = spawn(process.execPath, argumentos, {
    cwd: raiz,
    env: { PATH: process.env.PATH ?? '', ...ambiente },
  });
  let saida = '';
  processo.stdout.on('data', (pedaco: Buffer) => (saida += pedaco.toString()));
  processo.stderr.on('data', (pedaco: Buffer) => (saida += pedaco.toString()));
  const fim = new Promise<{ codigo: number | null; sinal: NodeJS.Signals | null }>((resolver) =>
    processo.once('exit', (codigo, sinal) => {
      resolver({ codigo, sinal });
    }),
  );
  return { processo, fim, saida: () => saida };
}

async function aguardarNoAr(url: string, limiteMs: number): Promise<Response> {
  const limite = performance.now() + limiteMs;
  for (;;) {
    try {
      return await fetch(url);
    } catch (erro) {
      if (performance.now() > limite) throw erro;
      await new Promise((resolver) => setTimeout(resolver, 200));
    }
  }
}

describe('boot do worker (processo real)', () => {
  it('sobe, responde as sondas e encerra com SIGTERM de forma graciosa', async () => {
    const porta = await portaLivre();
    const { processo, fim, saida } = subirProcesso({
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      PORT: String(porta),
      VERSAO: 'boot-teste',
      // Portas sem serviço: o worker sobe mesmo assim e se declara degradada.
      DATABASE_URL: 'postgresql://u:s@127.0.0.1:1/db',
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_REGION: 'us-east-1',
    });

    try {
      const vivo = await aguardarNoAr(`http://127.0.0.1:${String(porta)}/health/live`, 30_000);
      expect(vivo.status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${String(porta)}/health/ready`)).status).toBe(503);
    } finally {
      processo.kill('SIGTERM');
    }

    // O worker trata o SIGTERM: fecha saúde, relay e telemetria e termina normalmente.
    expect(await fim).toEqual({ codigo: 0, sinal: null });
    expect(saida()).toContain('"msg":"worker no ar"');
    expect(saida()).toContain('"msg":"worker encerrado"');
  }, 60_000);

  it('não sobe com ambiente inválido e diz o que falta, sem expor valores', async () => {
    const { fim, saida } = subirProcesso({ NODE_ENV: 'test', REDIS_URL: 'segredo-invalido' });

    expect((await fim).codigo).toBe(1);
    expect(saida()).toContain('DATABASE_URL: obrigatória e não definida');
    expect(saida()).not.toContain('segredo-invalido');
  }, 60_000);
});
