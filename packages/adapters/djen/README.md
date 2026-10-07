# @pz/adapter-djen

Adaptador `FontePublicacoes` (ADR-005, ADR-014) sobre a API pública de comunicações do CNJ (DJEN), `https://comunicaapi.pje.jus.br/api/v1/comunicacao`.

- `buscarPorOab` (`numeroOab`, `ufOab`) e `buscarPorProcesso` (`numeroProcesso`, só dígitos), sempre com a janela de disponibilização. Paginação de 100 itens; acima de 100 páginas o adaptador recusa e pede janela menor.
- Teor normalizado (HTML, entidades, espaços e quebras) antes do SHA-256; `idExterno` é o `id` do DJEN.
- `urlFonte` é a certidão pública do DJEN (`/comunicacao/{hash}/certidao`). O `link` do tribunal fica só em `metadados.linkTribunal`: o conector nunca o abre (dispararia a ciência).
- Erros: 429 → `ErroLimiteExcedido` (com `Retry-After`), 5xx e rede → `ErroTransitorio`, demais 4xx e corpo fora do formato → `ErroPermanente`.
- Limites do descritor: 20 requisições por minuto (cabeçalho `x-ratelimit-limit` observado em 07/10/2026; não há documentação oficial publicada), concorrência 1, timeout de 30 s.

## Configuração

Sem credencial. `urlBase` só muda em teste. Nada de segredo por ambiente.

## Testes

- Unitários: normalização, classificação, paginação e mapeamento.
- Contrato (`pnpm test:int`): `verificarContratoFontePublicacoes` contra um servidor local com `fixtures/`, respostas reais de 07/10/2026 **anonimizadas** (nomes, OAB, processos, teor, links e hashes fictícios). Sem rede externa.
