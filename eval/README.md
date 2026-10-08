# eval

Conjunto de avaliação da IA (HU22, ADR-008): publicações anonimizadas e anotadas por advogados. **Nunca versionar dados identificáveis** (CLAUDE.md, seções 3 e 11).

Implementado em: HU22 (PZ-160 formato, anonimização e verificação; PZ-161 runner e gate no CI). Siga o [CLAUDE.md](/CLAUDE.md) e a página Arquitetura do PrejuZero.

## Formato

Um arquivo `casos/<id>.json` por caso, validado por `CasoDeAvaliacao` ([src/caso.ts](src/caso.ts)):

- `teor`: texto da publicação já anonimizado.
- `anotacao`: `tipoAto` (código da taxonomia aprovada, HU15, ou `desconhecido`), `trecho` literal do teor e `prazoCitado` (o que o texto diz, ou `null`). Nunca data de vencimento.
- `anotador` e `revisor`: pseudônimos (ex.: `adv-03`), pessoas diferentes. `revisor: null` = ainda não conferido.
- `origem`: `real-anonimizado` (exige `anonimizacaoConferidaPor`) ou `ficticio` (só para testar o fluxo).

Os casos `ficticio-*` foram escritos pela IA programadora, com códigos de ato provisórios; não entram na meta de 98% e devem sair quando houver casos reais revisados.

## Como incluir casos reais

1. Guarde a publicação original **fora do repositório**.
2. `pnpm --filter @pz/eval anonimizar <arquivo.txt> --nome "Parte A" --nome "Advogado B"` (nomes das partes e advogados vindos dos metadados). O texto sai no stdout; o que parecer nome sai como suspeita para revisar.
3. Confira o texto à mão, corrija o que sobrou e crie `casos/<id>.json` com a anotação.
4. Outro advogado revisa a anotação (`revisor`) e a anonimização (`anonimizacaoConferidaPor`).
5. `pnpm --filter @pz/eval test` roda a verificação automática (formato, trecho literal, revisor diferente, nenhum CPF/CNPJ/e-mail/CEP/telefone/número CNJ/OAB/endereço). O CI bloqueia o PR se falhar.
6. A cada lote, `pnpm --filter @pz/eval amostrar --tamanho 20` sorteia casos para conferência manual; registre a semente no PR.

## Avaliação e gate (`pnpm eval`)

Roda cada caso pelo mesmo caso de uso da produção (regras rápidas, depois a plataforma de IA com o prompt e a configuração versionados) e gera `relatorio/relatorio.md` e `.json`: acurácia, acertos por tipo, matriz de confusão, prazo citado, origem e situação, custo estimado e latência. No CI o relatório vira o artefato `avaliacao-ia` e o resumo do job.

- **Referência** ([referencia/](referencia/)): cópia versionada da taxonomia (HU15) e das regras rápidas vigentes (HU20). As atuais são **provisórias** (`provisoria: true`); trocar pela exportação aprovada pelo curador.
- **Gravações** (`gravacoes/<tarefa@versao>.json`): respostas reais do modelo, reproduzidas no CI sem rede e sem custo. A chave de cada resposta é o hash do prompt montado (texto, versão, taxonomia, teor) e do modelo com seus parâmetros: mudou qualquer um, a gravação deixa de valer.
- **Regravar** (exige `ANTHROPIC_API_KEY`, nunca no CI): `ANTHROPIC_API_KEY=... pnpm eval --gravar`. Regrava as respostas da versão atual do prompt e grava o resultado em `historico/<tarefa@versao>.json` (histórico por versão do prompt). Versione os dois arquivos no PR.
- **Gate**: só casos `real-anonimizado` com revisor contam para a meta (≥ 98%). Reprova abaixo da meta ou se faltar gravação para algum caso da meta. Sem casos reais revisados, passa com aviso explícito no CI.
