import { lookup } from 'node:dns';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import { isIP } from 'node:net';

import { definirDescritor, EntregaWebhook, ErroPermanente } from '@pz/integracoes';

import { enderecoInterno } from './rede.js';

import type { EntregadorWebhook, ResultadoEntregaWebhook, SaudeAdaptador } from '@pz/integracoes';
import type { Clock } from '@pz/kernel';
import type { LookupFunction } from 'node:net';

export const DESCRITOR_WEBHOOK_HTTP = definirDescritor({
  id: 'webhook-http',
  porta: 'entregador-webhook',
  versao: '1.0.0',
  capacidades: { https: true, redirecionamentos: false },
  limites: { concorrencia: 10, timeoutMs: 15_000 },
  requerCredenciais: false,
});

export interface ConfiguracaoWebhookHttp {
  /** Ambiente local: aceita `http://` e endereços internos (receptor de teste na máquina). */
  readonly permitirRedeLocal: boolean;
  readonly timeoutMs?: number;
}

const RECUSADO = 'PZ_ENDERECO_RECUSADO';

/**
 * Resolve o nome e recusa endereço interno no momento da conexão: a checagem vale para o IP de
 * fato conectado, então trocar o DNS entre a validação e o envio (rebinding) não adianta.
 */
function lookupSeguro(permitirRedeLocal: boolean): LookupFunction {
  return (nome, opcoes, pronto) => {
    lookup(nome, { ...opcoes, all: true }, (erro, enderecos) => {
      if (erro !== null) {
        pronto(erro, '', 4);
        return;
      }
      const lista = Array.isArray(enderecos) ? enderecos : [];
      const recusado = !permitirRedeLocal && lista.some((e) => enderecoInterno(e.address));
      const primeiro = lista[0];
      if (recusado || primeiro === undefined) {
        pronto(Object.assign(new Error('endereço recusado'), { code: RECUSADO }), '', 4);
        return;
      }
      if (opcoes.all === true) pronto(null, lista);
      else pronto(null, primeiro.address, primeiro.family);
    });
  };
}

/**
 * `EntregadorWebhook` por HTTP(S) (ADR-023): um POST por entrega, sem seguir redirecionamentos,
 * sem rede interna fora do ambiente local e com timeout. O status volta como valor; o módulo
 * decide se tenta de novo.
 */
export class EntregadorWebhookHttp implements EntregadorWebhook {
  readonly #lookup: LookupFunction;
  readonly #timeoutMs: number;

  constructor(
    private readonly config: ConfiguracaoWebhookHttp,
    private readonly relogio: Clock,
  ) {
    this.#lookup = lookupSeguro(config.permitirRedeLocal);
    this.#timeoutMs = config.timeoutMs ?? 10_000;
  }

  entregar(entrega: EntregaWebhook): Promise<ResultadoEntregaWebhook> {
    const valida = EntregaWebhook.safeParse(entrega);
    if (!valida.success) {
      return Promise.reject(new ErroPermanente('entrega fora do modelo canônico', 'webhook-http'));
    }
    const url = new URL(valida.data.url);
    if (url.protocol === 'http:' && !this.config.permitirRedeLocal) {
      return Promise.resolve({ tipo: 'falha', motivo: 'endereco-recusado' });
    }
    // IP escrito na URL não passa pelo lookup: checa aqui.
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const literalInterno = isIP(host) !== 0 && enderecoInterno(host);
    if (literalInterno && !this.config.permitirRedeLocal) {
      return Promise.resolve({ tipo: 'falha', motivo: 'endereco-recusado' });
    }
    if (url.username !== '' || url.password !== '') {
      return Promise.resolve({ tipo: 'falha', motivo: 'endereco-recusado' });
    }
    const corpo = Buffer.from(valida.data.corpo, 'utf8');
    const pedir = url.protocol === 'https:' ? requestHttps : requestHttp;
    return new Promise((resolver) => {
      const pedido = pedir(
        url,
        {
          method: 'POST',
          lookup: this.#lookup,
          timeout: this.#timeoutMs,
          headers: {
            ...valida.data.cabecalhos,
            'content-type': 'application/json',
            'content-length': String(corpo.byteLength),
            'user-agent': 'PrejuZero-Webhooks/1',
          },
        },
        (resposta) => {
          // O corpo da resposta não interessa: descarta sem guardar (pode ser grande).
          resposta.resume();
          // Resposta recebida sempre tem status (Node), entre 100 e 599.
          const status = resposta.statusCode ?? 599;
          resolver(
            status >= 300 && status < 400
              ? { tipo: 'falha', motivo: 'redirecionamento' }
              : { tipo: 'resposta', status },
          );
        },
      );
      pedido.on('timeout', () => {
        pedido.destroy(Object.assign(new Error('timeout'), { code: 'PZ_TIMEOUT' }));
      });
      pedido.on('error', (erro: NodeJS.ErrnoException) => {
        resolver({
          tipo: 'falha',
          motivo:
            erro.code === RECUSADO
              ? 'endereco-recusado'
              : erro.code === 'PZ_TIMEOUT'
                ? 'timeout'
                : 'rede',
        });
      });
      pedido.end(corpo);
    });
  }

  /** Sem provedor central: a saúde é a do próprio processo (cada endereço é de um integrador). */
  saude(): Promise<SaudeAdaptador> {
    return Promise.resolve({ estado: 'operacional', verificadoEm: this.relogio.agora() });
  }
}
