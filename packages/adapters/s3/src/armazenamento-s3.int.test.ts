import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { verificarContratoArmazenamento } from '@pz/integracoes/contrato';
import { gerarUuidV7, SystemClock } from '@pz/kernel';
import { GenericContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ArmazenamentoS3, DESCRITOR_S3 } from './armazenamento-s3.js';

import type { ConfiguracaoS3 } from './armazenamento-s3.js';
import type { StartedTestContainer } from 'testcontainers';

// Credenciais fictícias do contêiner de teste.
const CHAVE = 'pz_teste';
const SEGREDO = 'pz_teste_segredo_local';
const BUCKET = 'pz-arquivos-teste';
const BUCKET_WORM = 'pz-auditoria-worm-teste';
let admin: S3Client;

let rustfs: StartedTestContainer;
let endpoint = '';
const abertos: ArmazenamentoS3[] = [];

beforeAll(async () => {
  // Mesma imagem do ambiente local (ADR-017).
  rustfs = await new GenericContainer('rustfs/rustfs:1.0.1')
    .withEnvironment({ RUSTFS_ACCESS_KEY: CHAVE, RUSTFS_SECRET_KEY: SEGREDO })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/health', 9000).forStatusCode(200))
    .start();
  endpoint = `http://${rustfs.getHost()}:${String(rustfs.getMappedPort(9000))}`;
  admin = new S3Client({
    region: 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: CHAVE, secretAccessKey: SEGREDO },
  });
  await admin.send(new CreateBucketCommand({ Bucket: BUCKET }));
  // Como no ambiente local (ADR-017): object lock só pode ser ligado na criação do bucket.
  await admin.send(
    new CreateBucketCommand({ Bucket: BUCKET_WORM, ObjectLockEnabledForBucket: true }),
  );
}, 300_000);

afterAll(async () => {
  for (const armazenamento of abertos) armazenamento.encerrar();
  admin.destroy();
  await rustfs.stop();
});

function criar(ajustes: Partial<ConfiguracaoS3> = {}): ArmazenamentoS3 {
  const armazenamento = new ArmazenamentoS3(
    {
      bucket: BUCKET,
      regiao: 'us-east-1',
      endpoint,
      credenciais: { idChave: CHAVE, segredo: SEGREDO },
      forcarPathStyle: true,
      criptografia: 'nenhuma',
      tiposPermitidos: ['text/plain', 'application/pdf'],
      tamanhoMaximoBytes: 1024,
      ...ajustes,
    },
    new SystemClock(),
  );
  abertos.push(armazenamento);
  return armazenamento;
}

verificarContratoArmazenamento('S3 (RustFS)', {
  descritor: DESCRITOR_S3,
  criar: () => criar(),
  criarComCredencialInvalida: () => criar({ credenciais: { idChave: CHAVE, segredo: 'errado' } }),
  // Porta 1 sem nada escutando: conexão recusada na hora.
  criarInalcancavel: () => criar({ endpoint: 'http://127.0.0.1:1' }),
  tipoPermitido: 'text/plain',
  tipoProibido: 'application/x-msdownload',
  tamanhoMaximoBytes: 1024,
});

describe('cópia WORM (object lock em modo COMPLIANCE, HU08)', () => {
  it('grava com retenção e nem as credenciais de administrador apagam a versão antes do prazo', async () => {
    const tenant = gerarUuidV7();
    const worm = criar({
      bucket: BUCKET_WORM,
      tiposPermitidos: ['application/x-ndjson'],
      retencaoDias: 1,
    });
    await worm.gravar({
      tenantId: tenant,
      caminho: 'auditoria/2026/10/07/1-1.ndjson',
      conteudo: new TextEncoder().encode('{}\n'),
      tipoMime: 'application/x-ndjson',
    });
    const chave = `${tenant}/auditoria/2026/10/07/1-1.ndjson`;
    const objeto = await admin.send(new HeadObjectCommand({ Bucket: BUCKET_WORM, Key: chave }));
    expect(objeto.ObjectLockMode).toBe('COMPLIANCE');
    expect(objeto.ObjectLockRetainUntilDate?.getTime() ?? 0).toBeGreaterThan(
      Date.now() + 23 * 3600 * 1000,
    );
    await expect(
      admin.send(
        new DeleteObjectCommand({ Bucket: BUCKET_WORM, Key: chave, VersionId: objeto.VersionId }),
      ),
    ).rejects.toThrow();
  });
});
