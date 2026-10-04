# ADR-017 · Armazenamento S3-compatível local: RustFS no lugar do MinIO

- **Status:** Aceito
- **Data:** 2026-10-03
- **Complementa:** ADR-010 (substitui apenas a menção ao MinIO no ambiente local)

## Contexto

O ADR-010 previa o MinIO como armazenamento S3-compatível no ambiente local. Em 2025 o MinIO deixou de publicar imagens da edição comunitária: a imagem `minio/minio` não está mais disponível no Docker Hub. O ambiente local precisa de um serviço compatível com S3 que suporte **object lock**, porque a cópia WORM da trilha de auditoria (ADR-006, HU08) depende disso.

## Decisão

Usar o **RustFS** (licença Apache-2.0) como armazenamento S3-compatível local, com imagem fixada por versão (`rustfs/rustfs:1.0.1`). Os buckets locais são criados por um contêiner do AWS CLI, de forma idempotente, e o bucket de auditoria é criado com object lock.

## Consequências

- Nenhum código muda: o adaptador `ArmazenamentoArquivos` (HU09) usa o SDK S3 com endpoint configurável, igual para RustFS local e Amazon S3 em produção.
- O kit de testes de contrato do adaptador de armazenamento roda contra o RustFS no CI.
- Se o RustFS deixar de atender (ex.: object lock), as alternativas avaliadas são SeaweedFS (Apache-2.0) e LocalStack; a troca é só no `infra/docker/compose.yml`.
