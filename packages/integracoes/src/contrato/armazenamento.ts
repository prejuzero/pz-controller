import { gerarUuidV7, SystemClock } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { definirDescritor } from '../descritor.js';
import { ErroCredencialInvalida, ErroPermanente, ErroTransitorio } from '../erros.js';
import { MetadadosArquivo } from '../portas/armazenamento.js';
import { RegistroDeAdaptadores } from '../registro.js';

import type { DescritorAdaptador } from '../descritor.js';
import type { ArmazenamentoArquivos } from '../portas/armazenamento.js';

export interface CenarioArmazenamento {
  readonly descritor: DescritorAdaptador;
  /** Adaptador apontando para um provedor real ou local (ex.: RustFS em contêiner). */
  criar(): ArmazenamentoArquivos;
  /** Mesmo provedor, credencial errada. */
  criarComCredencialInvalida(): ArmazenamentoArquivos;
  /** Provedor fora do ar (ex.: porta sem nada escutando). */
  criarInalcancavel(): ArmazenamentoArquivos;
  readonly tipoPermitido: string;
  readonly tipoProibido: string;
  readonly tamanhoMaximoBytes: number;
}

const bytes = (texto: string) => new TextEncoder().encode(texto);

/**
 * Kit de contrato da porta `ArmazenamentoArquivos` (HU09, ADR-005): todo adaptador de
 * armazenamento chama esta suíte no próprio teste de integração e só entra se passar.
 */
export function verificarContratoArmazenamento(nome: string, cenario: CenarioArmazenamento): void {
  describe(`contrato ArmazenamentoArquivos: ${nome}`, () => {
    const tenant = gerarUuidV7();
    const outroTenant = gerarUuidV7();

    it('grava, lê os metadados no modelo canônico e baixa pela URL assinada', async () => {
      const armazenamento = cenario.criar();
      const conteudo = bytes('conteúdo de teste');
      await armazenamento.gravar({
        tenantId: tenant,
        caminho: 'contrato/ida-e-volta.txt',
        conteudo,
        tipoMime: cenario.tipoPermitido,
      });
      const metadados = await armazenamento.metadados(tenant, 'contrato/ida-e-volta.txt');
      expect(MetadadosArquivo.parse(metadados)).toMatchObject({
        tamanhoBytes: conteudo.byteLength,
        tipoMime: cenario.tipoPermitido,
      });
      const url = await armazenamento.urlAssinada({
        tenantId: tenant,
        caminho: 'contrato/ida-e-volta.txt',
        operacao: 'download',
        expiraEmSegundos: 60,
      });
      const resposta = await fetch(url);
      expect(resposta.status).toBe(200);
      expect(new Uint8Array(await resposta.arrayBuffer())).toEqual(conteudo);
    });

    it('upload direto pela URL assinada só aceita o tipo e o tamanho autorizados', async () => {
      const armazenamento = cenario.criar();
      const conteudo = bytes('upload direto');
      const pedido = {
        tenantId: tenant,
        caminho: 'contrato/upload.txt',
        operacao: 'upload' as const,
        expiraEmSegundos: 60,
        tipoMime: cenario.tipoPermitido,
        tamanhoBytes: conteudo.byteLength,
      };
      const enviar = async (corpo: Uint8Array, tipo: string) =>
        (
          await fetch(await armazenamento.urlAssinada(pedido), {
            method: 'PUT',
            body: corpo,
            headers: { 'content-type': tipo },
          })
        ).status;

      expect(
        await enviar(bytes('upload direto, maior que o autorizado'), cenario.tipoPermitido),
      ).toBeGreaterThanOrEqual(400);
      expect(await enviar(conteudo, cenario.tipoProibido)).toBeGreaterThanOrEqual(400);
      expect(await armazenamento.metadados(tenant, 'contrato/upload.txt')).toBeUndefined();

      expect(await enviar(conteudo, cenario.tipoPermitido)).toBe(200);
      expect(await armazenamento.metadados(tenant, 'contrato/upload.txt')).toMatchObject({
        tamanhoBytes: conteudo.byteLength,
      });
    });

    it('um tenant não alcança o arquivo de outro com o mesmo caminho', async () => {
      const armazenamento = cenario.criar();
      await armazenamento.gravar({
        tenantId: tenant,
        caminho: 'contrato/sigiloso.txt',
        conteudo: bytes('só do tenant A'),
        tipoMime: cenario.tipoPermitido,
      });
      expect(await armazenamento.metadados(outroTenant, 'contrato/sigiloso.txt')).toBeUndefined();
      const url = await armazenamento.urlAssinada({
        tenantId: outroTenant,
        caminho: 'contrato/sigiloso.txt',
        operacao: 'download',
        expiraEmSegundos: 60,
      });
      expect((await fetch(url)).status).toBe(404);
    });

    it('inexistente: metadados vazio; remover é idempotente', async () => {
      const armazenamento = cenario.criar();
      expect(await armazenamento.metadados(tenant, 'contrato/nunca-existiu.txt')).toBeUndefined();
      await armazenamento.remover(tenant, 'contrato/nunca-existiu.txt');
      await armazenamento.gravar({
        tenantId: tenant,
        caminho: 'contrato/remover.txt',
        conteudo: bytes('x'),
        tipoMime: cenario.tipoPermitido,
      });
      await armazenamento.remover(tenant, 'contrato/remover.txt');
      await armazenamento.remover(tenant, 'contrato/remover.txt');
      expect(await armazenamento.metadados(tenant, 'contrato/remover.txt')).toBeUndefined();
    });

    it('recusa tipo não permitido, tamanho acima do limite, validade longa e caminho inválido', async () => {
      const armazenamento = cenario.criar();
      const base = { tenantId: tenant, caminho: 'contrato/recusado.bin' };
      await expect(
        armazenamento.gravar({ ...base, conteudo: bytes('x'), tipoMime: cenario.tipoProibido }),
      ).rejects.toBeInstanceOf(ErroPermanente);
      await expect(
        armazenamento.gravar({
          ...base,
          conteudo: new Uint8Array(cenario.tamanhoMaximoBytes + 1),
          tipoMime: cenario.tipoPermitido,
        }),
      ).rejects.toBeInstanceOf(ErroPermanente);
      await expect(
        armazenamento.urlAssinada({
          ...base,
          operacao: 'upload',
          expiraEmSegundos: 60,
          tipoMime: cenario.tipoPermitido,
          tamanhoBytes: cenario.tamanhoMaximoBytes + 1,
        }),
      ).rejects.toBeInstanceOf(ErroPermanente);
      await expect(
        armazenamento.urlAssinada({
          ...base,
          operacao: 'download',
          expiraEmSegundos: 7 * 24 * 3600,
        }),
      ).rejects.toBeInstanceOf(ErroPermanente);
      await expect(armazenamento.metadados(tenant, '../outro-tenant/arquivo')).rejects.toThrow();
    });

    it('classifica os erros: credencial inválida e provedor fora do ar', async () => {
      const semCredencial = cenario.criarComCredencialInvalida();
      await expect(
        semCredencial.gravar({
          tenantId: tenant,
          caminho: 'contrato/credencial.txt',
          conteudo: bytes('x'),
          tipoMime: cenario.tipoPermitido,
        }),
      ).rejects.toBeInstanceOf(ErroCredencialInvalida);
      await expect(
        semCredencial.metadados(tenant, 'contrato/credencial.txt'),
      ).rejects.toBeInstanceOf(ErroCredencialInvalida);

      const foraDoAr = cenario.criarInalcancavel();
      await expect(foraDoAr.metadados(tenant, 'contrato/rede.txt')).rejects.toBeInstanceOf(
        ErroTransitorio,
      );
      expect((await foraDoAr.saude()).estado).toBe('indisponivel');
      expect((await semCredencial.saude()).estado).toBe('indisponivel');
      expect((await cenario.criar().saude()).estado).toBe('operacional');
    });

    it('funciona pelo registro, com resiliência e validação da saída', async () => {
      const registro = new RegistroDeAdaptadores(
        { padrao: { 'armazenamento-arquivos': cenario.descritor.id } },
        { relogio: new SystemClock() },
      );
      registro.registrar(
        definirDescritor({ ...cenario.descritor, porta: 'armazenamento-arquivos' }),
        () => cenario.criar(),
      );
      registro.validar();
      const armazenamento = registro.obter('armazenamento-arquivos', tenant);
      await armazenamento.gravar({
        tenantId: tenant,
        caminho: 'contrato/registro.txt',
        conteudo: bytes('pelo registro'),
        tipoMime: cenario.tipoPermitido,
      });
      expect(await armazenamento.metadados(tenant, 'contrato/registro.txt')).toBeDefined();
      expect(registro.situacao()).toEqual([
        expect.objectContaining({ adaptador: cenario.descritor.id, estado: 'operacional' }),
      ]);
    });
  });
}
