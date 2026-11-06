# ADR-021 · Chaves de dados identificadas e índice cego para campos sensíveis

- **Status:** Proposto (aguarda aprovação humana)
- **Data:** 2026-11-03

## Contexto

A HU37 (PZ-219) pede criptografia de envelope para segredos e campos sensíveis (segredo do 2FA, CPF), atrás de uma porta, com KMS em produção e chave local em desenvolvimento, e rotação documentada e testada. O dump do banco não pode expor esses dados em claro. O CPF do advogado precisa continuar único em toda a base, e as leituras são por campo, em todo acesso ao perfil.

## Decisão

- Porta `ProvedorChaves` (`packages/integracoes`), síncrona: devolve a chave de dados ativa, as chaves antigas pelo id e a chave do índice cego. Em produção, as chaves de dados ficam cifradas pelo KMS e são desembrulhadas uma vez no boot (o custo do KMS sai do caminho de cada leitura). Localmente, `ProvedorChavesLocal` deriva a chave de dados da `CHAVE_CIFRAGEM` (HKDF) ou lê a lista `CHAVES_DE_DADOS` (`id:base64,…`, a primeira cifra).
- Formato `v2.<id>.<iv>.<tag>.<dados>` (AES-256-GCM, id como dado autenticado). O formato `v1` de antes (chave da aplicação direta) continua legível, para os segredos do 2FA já gravados.
- CPF do advogado e documento do cliente gravados só cifrados. O CPF ganha um índice cego (HMAC-SHA256 com chave própria e estável), que mantém a unicidade sem o CPF em claro.
- Migração em duas fases (expand/contract): a primeira adiciona as colunas cifradas e deixa as em claro vazias nos novos registros; um job diário (`cadastro.recifrar-campos`) cifra os legados e recifra os de chave antiga. A remoção das colunas em claro (fase contract, migração `20261120000000_campos_cifrados_contract`) veio em 06/11/2026, com o único ambiente existente (o local) já recifrado; a migração recusa se ainda houver valor em claro.
- Rotação: pôr a nova chave na frente da lista, manter as antigas, rodar o job; remover a antiga só depois (runbook `docs/runbooks/rotacao-de-chaves.md`).

## Alternativas

- **Chave de dados por registro (envelope clássico, uma chamada ao KMS por leitura):** isola cada registro, mas cada leitura vira uma chamada de rede e a interface de cifra deixa de ser síncrona, o que muda o módulo identidade inteiro. Fica para o cofre de credenciais da F2, onde o volume é baixo.
- **Cifra no banco (pgcrypto) ou só criptografia de disco:** a chave ficaria no banco ou o dump sairia em claro.

## Consequências

- A chave do índice cego não roda: trocá-la exige recalcular todos os índices (job de recifra com a nova chave de índice). Sem a chave, o índice não permite dicionário de CPFs.
- O adaptador KMS e a cifra de banco, S3, Redis e backups com chaves gerenciadas dependem da AWS (pendência da HU37).
