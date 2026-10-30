import { err, ok, Validacao } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { AssistenteController, CompromissosController } from './compromissos.controller.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { AnalisarDocumento, AnalisarTexto } from '@pz/classificacao';
import type { AgendarCompromisso, CancelarCompromisso, ListarCompromissos } from '@pz/prazos';

// Dados FICTÍCIOS: só a ligação HTTP → casos de uso (HU25).
const ID = '01a10e00-0000-7000-8000-0000000a0001';
const requisicao = {
  autenticacao: { sessao: { usuarioId: ID, tenantId: ID } },
} as unknown as RequisicaoAutenticada;
const falha = () => Promise.resolve(err(new Validacao([])));

describe('CompromissosController (HU25)', () => {
  it('lista, agenda e cancela pelos casos de uso; erro vira exceção', async () => {
    const autores: unknown[] = [];
    const ok1 = (autor: unknown) => {
      autores.push(autor);
      return Promise.resolve(ok({ id: ID }));
    };
    const controller = new CompromissosController(
      {
        executar: () => Promise.resolve(ok([{ id: ID }])),
      } as unknown as ListarCompromissos<unknown>,
      { executar: ok1 } as unknown as AgendarCompromisso<unknown>,
      { executar: ok1 } as unknown as CancelarCompromisso<unknown>,
    );
    expect(await controller.listarCompromissos({})).toEqual({ itens: [{ id: ID }] });
    expect(await controller.agendarCompromisso(requisicao, {})).toEqual({ id: ID });
    expect(await controller.cancelarCompromisso(requisicao, ID, {})).toEqual({ id: ID });
    expect(autores).toEqual([
      { tenantId: ID, usuarioId: ID, canal: 'portal' },
      { tenantId: ID, usuarioId: ID, canal: 'portal' },
    ]);
    const falhando = new CompromissosController(
      { executar: falha } as unknown as ListarCompromissos<unknown>,
      { executar: falha } as unknown as AgendarCompromisso<unknown>,
      { executar: falha } as unknown as CancelarCompromisso<unknown>,
    );
    await expect(falhando.listarCompromissos({})).rejects.toThrow(Validacao);
    await expect(falhando.agendarCompromisso(requisicao, {})).rejects.toThrow(Validacao);
    await expect(falhando.cancelarCompromisso(requisicao, ID, {})).rejects.toThrow(Validacao);
  });
});

const analiseVazia = {
  origem: 'nenhuma',
  situacao: 'a_confirmar',
  tipoAto: null,
  confianca: null,
  prazoCitado: null,
  evidencias: [],
  motivo: 'ia-desligada',
};
const documento = {
  executar: (_tenant: string, bytes: Uint8Array) =>
    Promise.resolve(
      bytes.byteLength === 0
        ? err(new Validacao([], 'pdf-sem-texto'))
        : ok({ arquivoId: 'assistente/x.pdf', paginas: 1, analise: analiseVazia }),
    ),
} as unknown as AnalisarDocumento<unknown>;

describe('AssistenteController (HU25)', () => {
  it('PDF: devolve o arquivo guardado e a análise; corpo não binário ou sem texto recusa', async () => {
    const controller = new AssistenteController({} as AnalisarTexto<unknown>, documento);
    expect(await controller.analisarPdf(requisicao, Buffer.from('%PDF'))).toEqual({
      arquivoId: 'assistente/x.pdf',
      paginas: 1,
      analise: analiseVazia,
    });
    await expect(controller.analisarPdf(requisicao, { texto: 'x' })).rejects.toThrow();
    await expect(controller.analisarPdf(requisicao, Buffer.alloc(0))).rejects.toThrow(Validacao);
  });

  it('devolve ato, prazo citado e evidência; nunca data', async () => {
    const controller = new AssistenteController(
      {
        executar: (texto: string) =>
          Promise.resolve({
            origem: 'regra',
            situacao: 'ok',
            tipoAto: 'citacao',
            confianca: 0.99,
            prazoCitado:
              texto === 'sem prazo'
                ? null
                : {
                    quantidade: 15,
                    unidade: 'dias',
                    unidadeImplicita: false,
                    divergente: false,
                    evidencia: { inicio: 0, fim: 1, trecho: 'x' },
                  },
            evidencias: [{ inicio: 0, fim: 7, trecho: 'Cite-se' }],
          }),
      } as unknown as AnalisarTexto<unknown>,
      documento,
    );
    expect(await controller.analisarTexto(requisicao, { texto: 'Cite-se em 15 dias' })).toEqual({
      origem: 'regra',
      situacao: 'ok',
      tipoAto: 'citacao',
      confianca: 0.99,
      prazoCitado: { quantidade: 15, unidade: 'dias', divergente: false },
      evidencias: [{ inicio: 0, fim: 7, trecho: 'Cite-se' }],
      motivo: null,
    });
    expect(
      (await controller.analisarTexto(requisicao, { texto: 'sem prazo' })).prazoCitado,
    ).toBeNull();
    await expect(controller.analisarTexto(requisicao, { texto: '' })).rejects.toThrow();
  });
});
