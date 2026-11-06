import { createServer } from 'node:http';

import { FixedClock, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EntregadorWebhookHttp } from './entregador-webhook-http.js';
import { enderecoInterno } from './rede.js';

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Receptor local de teste: sem rede externa no CI.
const relogio = new FixedClock(Instant.deIso('2026-11-06T12:00:00Z'));
const recebidos: { url: string; cabecalhos: Record<string, unknown>; corpo: string }[] = [];
let servidor: Server;
let base = '';

beforeAll(async () => {
  servidor = createServer((pedido, resposta) => {
    let corpo = '';
    pedido.on('data', (parte: Buffer) => (corpo += parte.toString('utf8')));
    pedido.on('end', () => {
      recebidos.push({ url: pedido.url ?? '', cabecalhos: pedido.headers, corpo });
      if (pedido.url === '/redireciona') {
        resposta.writeHead(302, { location: 'http://169.254.169.254/' }).end();
      } else if (pedido.url === '/lento') {
        setTimeout(() => resposta.writeHead(200).end(), 500);
      } else if (pedido.url === '/erro') {
        resposta.writeHead(503).end();
      } else {
        resposta.writeHead(204).end();
      }
    });
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  base = `http://127.0.0.1:${String((servidor.address() as AddressInfo).port)}`;
});

afterAll(() => {
  servidor.close();
});

const local = new EntregadorWebhookHttp({ permitirRedeLocal: true, timeoutMs: 200 }, relogio);
const producao = new EntregadorWebhookHttp({ permitirRedeLocal: false }, relogio);
const entrega = (url: string) => ({
  url,
  corpo: '{"id":"x"}',
  cabecalhos: { 'prejuzero-assinatura': 't=1,v1=ab' },
});

describe('entregador de webhook por HTTP (ADR-023)', () => {
  it('faz o POST com o corpo exato e os cabeçalhos; devolve o status como valor', async () => {
    expect(await local.entregar(entrega(`${base}/ok`))).toEqual({ tipo: 'resposta', status: 204 });
    expect(recebidos.at(-1)).toMatchObject({
      url: '/ok',
      corpo: '{"id":"x"}',
      cabecalhos: {
        'prejuzero-assinatura': 't=1,v1=ab',
        'content-type': 'application/json',
        'user-agent': 'PrejuZero-Webhooks/1',
      },
    });
    // Por nome, passa pelo lookup (o ambiente local aceita o loopback).
    expect(await local.entregar(entrega(base.replace('127.0.0.1', 'localhost') + '/ok'))).toEqual({
      tipo: 'resposta',
      status: 204,
    });
    expect(await local.entregar(entrega(`${base}/erro`))).toEqual({
      tipo: 'resposta',
      status: 503,
    });
  });

  it('não segue redirecionamento, respeita o timeout e trata rede fora', async () => {
    expect(await local.entregar(entrega(`${base}/redireciona`))).toEqual({
      tipo: 'falha',
      motivo: 'redirecionamento',
    });
    expect(await local.entregar(entrega(`${base}/lento`))).toEqual({
      tipo: 'falha',
      motivo: 'timeout',
    });
    expect(await local.entregar(entrega('http://127.0.0.1:1/'))).toEqual({
      tipo: 'falha',
      motivo: 'rede',
    });
    expect(await local.entregar(entrega('http://nao-existe.invalid/'))).toEqual({
      tipo: 'falha',
      motivo: 'rede',
    });
  });

  it('fora do ambiente local: só HTTPS, sem rede interna e sem credencial na URL', async () => {
    const recusado = { tipo: 'falha', motivo: 'endereco-recusado' };
    expect(await producao.entregar(entrega(`${base}/ok`))).toEqual(recusado);
    expect(await producao.entregar(entrega('https://127.0.0.1/'))).toEqual(recusado);
    expect(await producao.entregar(entrega('https://localhost/'))).toEqual(recusado);
    expect(await producao.entregar(entrega('https://[::1]/'))).toEqual(recusado);
    expect(await producao.entregar(entrega('https://u:s@exemplo.invalid/'))).toEqual(recusado);
    await expect(producao.entregar({ ...entrega('ftp://x'), corpo: '' })).rejects.toThrow(
      'modelo canônico',
    );
    expect((await producao.saude()).estado).toBe('operacional');
  });

  it('faixas internas e IPv4 mapeado em IPv6', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '192.168.0.1', '::1'])
      expect(enderecoInterno(ip)).toBe(true);
    expect(enderecoInterno('::ffff:10.0.0.1')).toBe(true);
    expect(enderecoInterno('fd00::1')).toBe(true);
    expect(enderecoInterno('nao-e-ip')).toBe(true);
    expect(enderecoInterno('203.0.113.10')).toBe(false);
    expect(enderecoInterno('2001:db8::1')).toBe(false);
  });
});
