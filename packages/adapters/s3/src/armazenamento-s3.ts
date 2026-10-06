import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { chaveDoArquivo, definirDescritor, ErroPermanente, sinalDaChamada } from '@pz/integracoes';
import { Instant } from '@pz/kernel';

import { classificarErroS3, ehNaoEncontrado } from './erros.js';

import type {
  ArmazenamentoArquivos,
  ArquivoParaGravar,
  MetadadosArquivo,
  PedidoUrlAssinada,
  SaudeAdaptador,
} from '@pz/integracoes';
import type { Clock, Uuid } from '@pz/kernel';

/** Repassa o sinal do timeout da resiliência ao SDK, para a chamada ser cortada de verdade. */
function opcoesDeEnvio(): { abortSignal?: AbortSignal } {
  const sinal = sinalDaChamada();
  return sinal === undefined ? {} : { abortSignal: sinal };
}

export const DESCRITOR_S3 = definirDescritor({
  id: 's3',
  porta: 'armazenamento-arquivos',
  versao: '1.0.0',
  capacidades: { urlAssinada: true, criptografiaEmRepouso: true, uploadDireto: true },
  limites: { concorrencia: 50, timeoutMs: 30_000 },
  requerCredenciais: true,
});

export interface ConfiguracaoS3 {
  readonly bucket: string;
  readonly regiao: string;
  /** Vazio na AWS; URL do RustFS local ou de outro S3-compatível. */
  readonly endpoint?: string;
  /** Vazio na AWS (papel IAM); chaves estáticas só no ambiente local. */
  readonly credenciais?: { readonly idChave: string; readonly segredo: string };
  readonly forcarPathStyle: boolean;
  /** Criptografia em repouso pelo provedor (SSE-S3). */
  readonly criptografia: 'AES256' | 'nenhuma';
  readonly tiposPermitidos: readonly string[];
  readonly tamanhoMaximoBytes: number;
  /** Validade máxima de uma URL assinada. Padrão: 15 min. */
  readonly expiracaoMaximaSegundos?: number;
}

/**
 * `ArmazenamentoArquivos` sobre o protocolo S3 (ADR-010/017): o mesmo código no RustFS local e
 * no Amazon S3. Toda chave é prefixada pelo tenant; tipo e tamanho são validados antes de
 * gravar e entram na assinatura do upload direto.
 */
export class ArmazenamentoS3 implements ArmazenamentoArquivos {
  readonly #cliente: S3Client;

  constructor(
    private readonly config: ConfiguracaoS3,
    private readonly relogio: Clock,
  ) {
    this.#cliente = new S3Client({
      region: config.regiao,
      forcePathStyle: config.forcarPathStyle,
      ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
      ...(config.credenciais === undefined
        ? {}
        : {
            credentials: {
              accessKeyId: config.credenciais.idChave,
              secretAccessKey: config.credenciais.segredo,
            },
          }),
      // Retentativa e timeout ficam com a resiliência padrão do registro, não com o SDK.
      maxAttempts: 1,
      // Checksums novos só quando exigidos: compatível com S3-compatíveis além da AWS.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async #enviar<Saida>(operacao: () => Promise<Saida>): Promise<Saida> {
    try {
      return await operacao();
    } catch (erro) {
      throw classificarErroS3(erro);
    }
  }

  #validarArquivo(tipoMime: string, tamanhoBytes: number): void {
    if (!this.config.tiposPermitidos.includes(tipoMime)) {
      throw new ErroPermanente(`tipo de arquivo não permitido: ${tipoMime}`, DESCRITOR_S3.id);
    }
    if (tamanhoBytes > this.config.tamanhoMaximoBytes) {
      throw new ErroPermanente(
        `arquivo acima do limite de ${String(this.config.tamanhoMaximoBytes)} bytes`,
        DESCRITOR_S3.id,
      );
    }
  }

  #criptografia() {
    return this.config.criptografia === 'AES256' ? { ServerSideEncryption: 'AES256' as const } : {};
  }

  async gravar(arquivo: ArquivoParaGravar): Promise<void> {
    const chave = chaveDoArquivo(arquivo.tenantId, arquivo.caminho);
    this.#validarArquivo(arquivo.tipoMime, arquivo.conteudo.byteLength);
    await this.#enviar(() =>
      this.#cliente.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: chave,
          Body: arquivo.conteudo,
          ContentType: arquivo.tipoMime,
          ...this.#criptografia(),
        }),
        opcoesDeEnvio(),
      ),
    );
  }

  async urlAssinada(pedido: PedidoUrlAssinada): Promise<string> {
    const chave = chaveDoArquivo(pedido.tenantId, pedido.caminho);
    const maxima = this.config.expiracaoMaximaSegundos ?? 900;
    if (
      !Number.isInteger(pedido.expiraEmSegundos) ||
      pedido.expiraEmSegundos <= 0 ||
      pedido.expiraEmSegundos > maxima
    ) {
      throw new ErroPermanente(
        `validade da URL deve ser de 1 a ${String(maxima)} s`,
        DESCRITOR_S3.id,
      );
    }
    if (pedido.operacao === 'download') {
      return this.#enviar(() =>
        getSignedUrl(
          this.#cliente,
          new GetObjectCommand({ Bucket: this.config.bucket, Key: chave }),
          {
            expiresIn: pedido.expiraEmSegundos,
          },
        ),
      );
    }
    this.#validarArquivo(pedido.tipoMime, pedido.tamanhoBytes);
    return this.#enviar(() =>
      getSignedUrl(
        this.#cliente,
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: chave,
          ContentType: pedido.tipoMime,
          ContentLength: pedido.tamanhoBytes,
          ...this.#criptografia(),
        }),
        {
          expiresIn: pedido.expiraEmSegundos,
          // Tipo e tamanho na assinatura: o provedor recusa upload diferente do autorizado.
          signableHeaders: new Set(['content-type', 'content-length']),
        },
      ),
    );
  }

  async remover(tenantId: Uuid, caminho: string): Promise<void> {
    const chave = chaveDoArquivo(tenantId, caminho);
    await this.#enviar(() =>
      this.#cliente.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: chave }),
        opcoesDeEnvio(),
      ),
    );
  }

  async metadados(tenantId: Uuid, caminho: string): Promise<MetadadosArquivo | undefined> {
    const chave = chaveDoArquivo(tenantId, caminho);
    try {
      const resposta = await this.#cliente.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: chave }),
        opcoesDeEnvio(),
      );
      return {
        tamanhoBytes: resposta.ContentLength ?? 0,
        tipoMime: resposta.ContentType ?? 'application/octet-stream',
        atualizadoEm: Instant.deEpochMs((resposta.LastModified ?? new Date(0)).getTime()),
      };
    } catch (erro) {
      if (ehNaoEncontrado(erro)) return undefined;
      throw classificarErroS3(erro);
    }
  }

  async saude(): Promise<SaudeAdaptador> {
    try {
      await this.#cliente.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return { estado: 'operacional', verificadoEm: this.relogio.agora() };
    } catch (erro) {
      return {
        estado: 'indisponivel',
        verificadoEm: this.relogio.agora(),
        detalhe: classificarErroS3(erro).message,
      };
    }
  }

  encerrar(): void {
    this.#cliente.destroy();
  }
}
