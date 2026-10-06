# @pz/adapter-s3

Adaptador da porta `ArmazenamentoArquivos` sobre o protocolo S3 (ADR-005/010/017): o mesmo código no RustFS local e no Amazon S3.

```ts
registro.registrar(DESCRITOR_S3, () => new ArmazenamentoS3(configuracao, relogio));
```

| Configuração         | Local (RustFS)              | AWS               |
| -------------------- | --------------------------- | ----------------- |
| `endpoint`           | `S3_ENDPOINT`               | vazio             |
| `credenciais`        | `S3_ACCESS_KEY_ID`/`SECRET` | vazio (papel IAM) |
| `forcarPathStyle`    | `true`                      | `false`           |
| `criptografia`       | `nenhuma` (ver abaixo)      | `AES256` (SSE-S3) |
| `tiposPermitidos`    | lista explícita por uso     | idem              |
| `tamanhoMaximoBytes` | limite por uso              | idem              |

- **Chaves por tenant:** sempre `<tenant>/<caminho>` (`chaveDoArquivo`), com travessia de diretório recusada.
- **Upload direto:** a URL assinada inclui `content-type` e `content-length` na assinatura; o provedor recusa arquivo de outro tipo ou tamanho (comprovado no kit de contrato).
- **Erros:** `classificarErroS3` converte o erro do SDK (credencial → `ErroCredencialInvalida`; 429/503/SlowDown → `ErroLimiteExcedido`; rede e 5xx → `ErroTransitorio`; demais 4xx → `ErroPermanente`). Retentativa e timeout ficam com a resiliência do registro (`maxAttempts: 1` no SDK); o sinal do timeout é repassado ao SDK.
- **Criptografia local:** o RustFS 1.0.1 responde `InvalidRequest` a `ServerSideEncryption: AES256` sem KMS configurado. Localmente use `nenhuma`; em produção, `AES256` (a verificação em staging está na HU72).

Testes: `pnpm test` (classificação de erros) e `pnpm test:int` (kit de contrato `verificarContratoArmazenamento` contra o RustFS em contêiner).
