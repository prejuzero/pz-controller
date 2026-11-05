# Rotação das chaves de dados (ADR-021)

Campos cifrados: segredo do 2FA, CPF do advogado e documento do cliente. Formato `v2.<id>.…`; o id diz qual chave cifrou.

## Rotacionar

1. Gere a nova chave: `openssl rand -base64 32`.
2. Ponha-a **na frente** de `CHAVES_DE_DADOS`, mantendo as antigas: `CHAVES_DE_DADOS=k2:<nova>,k1:<antiga>`. Sem a variável, a chave em uso é a derivada da `CHAVE_CIFRAGEM` (id `l1`); para rodar a partir dela, inclua-a explicitamente na lista antes de remover a derivação.
3. Faça o deploy da api e do worker com a mesma lista (a api passa a cifrar com a nova; a antiga ainda decifra).
4. Rode o job `cadastro.recifrar-campos` (agendado diariamente às 3h30; pelo painel das filas, `/admin/filas`, dá para adiantar). Ele é idempotente, recifra os campos do cadastro e os segredos do 2FA, e registra quantos de cada.
5. Confira que nenhum campo usa a chave antiga:
   `SELECT count(*) FROM advogado WHERE cpf_cifrado NOT LIKE 'v2.k2.%' OR cpf IS NOT NULL;`, o mesmo para `cliente.documento_cifrado` e `SELECT count(*) FROM usuario WHERE totp_segredo_cifrado NOT LIKE 'v2.k2.%';`.
6. Só então remova a chave antiga da lista e faça o deploy.

## Não fazer

- Remover uma chave antes do passo 5: os dados cifrados com ela ficam ilegíveis.
- Trocar a `CHAVE_CIFRAGEM` sem plano: dela derivam a chave do índice cego do CPF (unicidade) e a leitura do formato `v1`.

## Reverter a migração `20261111000000_campos_cifrados`

Só é possível com todos os CPFs ainda em claro. Depois do job, a reversão é recusada pelo próprio script.
