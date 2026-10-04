import { describe, expect, it } from 'vitest';

import {
  carregarAmbiente,
  ErroConfiguracao,
  esquemaArmazenamento,
  esquemaBanco,
  esquemaBase,
  esquemaObservabilidade,
  esquemaRedis,
  esquemaSmtp,
} from './env.js';

const esquemaApi = esquemaBase
  .extend(esquemaBanco.shape)
  .extend(esquemaRedis.shape)
  .extend(esquemaArmazenamento.shape)
  .extend(esquemaSmtp.shape)
  .extend(esquemaObservabilidade.shape);

const ambienteLocal = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'debug',
  DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
  REDIS_URL: 'redis://127.0.0.1:6379',
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'pz_dev',
  S3_SECRET_ACCESS_KEY: 'pz_dev_local_secret',
  S3_FORCE_PATH_STYLE: 'true',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
};

function capturarErro(executar: () => unknown): ErroConfiguracao {
  try {
    executar();
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) return erro;
    throw erro;
  }
  throw new Error('era esperado um ErroConfiguracao');
}

describe('carregarAmbiente', () => {
  it('converte e tipa um ambiente válido', () => {
    const ambiente = carregarAmbiente(esquemaApi, ambienteLocal);
    expect(ambiente.SMTP_PORT).toBe(1025);
    expect(ambiente.S3_FORCE_PATH_STYLE).toBe(true);
    expect(ambiente.LOG_LEVEL).toBe('debug');
  });

  it('aplica padrões quando a variável é opcional', () => {
    const ambiente = carregarAmbiente(esquemaBase, {});
    expect(ambiente).toEqual({ NODE_ENV: 'development', LOG_LEVEL: 'info' });
  });

  it('usa process.env quando nenhuma fonte é informada', () => {
    expect(carregarAmbiente(esquemaObservabilidade)).toBeTypeOf('object');
  });

  it('lista todos os problemas de uma vez', () => {
    const erro = capturarErro(() =>
      carregarAmbiente(esquemaApi, {
        ...ambienteLocal,
        DATABASE_URL: undefined,
        REDIS_URL: 'http://127.0.0.1:6379',
        SMTP_PORT: '99999',
        NODE_ENV: 'homologacao',
        S3_REGION: '',
        S3_FORCE_PATH_STYLE: 'sim',
      }),
    );
    expect(erro.problemas).toEqual(
      expect.arrayContaining([
        'DATABASE_URL: obrigatória e não definida',
        'REDIS_URL: formato inválido (url)',
        'SMTP_PORT: valor fora dos limites permitidos',
        'NODE_ENV: valor fora das opções permitidas',
        'S3_REGION: valor fora dos limites permitidos',
        'S3_FORCE_PATH_STYLE: valor fora das opções permitidas',
      ]),
    );
    expect(erro.message).toContain('6 problema(s)');
  });

  it('descreve tipos inválidos sem expor o valor', () => {
    const erro = capturarErro(() =>
      carregarAmbiente(esquemaSmtp, { SMTP_HOST: '127.0.0.1', SMTP_PORT: 'abc' }),
    );
    expect(erro.problemas).toEqual(['SMTP_PORT: valor inválido']);
  });

  it('nunca expõe valores na mensagem de erro', () => {
    const erro = capturarErro(() =>
      carregarAmbiente(esquemaBase.extend(esquemaBanco.shape), {
        DATABASE_URL: 'SENHA_SUPER_SECRETA',
        NODE_ENV: 'SENHA_SUPER_SECRETA',
      }),
    );
    expect(erro.problemas).toHaveLength(2);
    expect(erro.message).not.toContain('SENHA_SUPER_SECRETA');
    expect(erro.problemas.join(' ')).not.toContain('SENHA_SUPER_SECRETA');
  });

  it('identifica erro na raiz quando a fonte não é um objeto', () => {
    const erro = capturarErro(() =>
      carregarAmbiente(esquemaBase, 'texto' as unknown as Record<string, string>),
    );
    expect(erro.problemas[0]).toMatch(/^\(raiz\)/);
  });
});
