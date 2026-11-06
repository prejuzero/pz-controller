# @pz/assistente

Assistente de IA (F2, ADR-016). Por enquanto, o **catálogo de ferramentas** (HU59): as capacidades que a IA pode usar, as mesmas para o assistente interno (HU61), o servidor MCP (HU60) e a API pública (HU49).

## Ferramentas (só leitura)

| Ferramenta                 | Permissão         | Usa                                                                    |
| -------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `buscar_prazos`            | `prazos:ler`      | Busca avançada (HU28), mesmos filtros de `FiltrosBusca`                |
| `buscar_publicacoes`       | `publicacoes:ler` | Busca avançada de publicações                                          |
| `consultar_processo`       | `processos:ler`   | Processo pelo id                                                       |
| `simular_prazo`            | `prazos:ler`      | Prévia pelo **motor** de prazos, sem gravar (a IA nunca calcula datas) |
| `explicar_memoria_calculo` | `prazos:ler`      | Detalhe do prazo com a memória de cálculo                              |

`consultar_base_juridica` entra com a base jurídica (HU48). Ferramentas que alteram estado ficam fora até haver confirmação humana no cliente.

## Regras

- Entrada e saída pelos schemas do contrato da API (`@pz/contracts`): a IA vê o que o portal vê.
- O tenant vem da identidade autenticada (`ContextoDaFerramenta`), nunca do modelo; o catálogo (`@pz/ia`) recusa ferramenta com tenant na entrada.
- Toda chamada, permitida ou não, vai para a trilha como `ia.ferramenta-executada`.
- A porta `FontesDasFerramentas` é composta na api (`apps/api/src/assistente/catalogo.ts`) pelas APIs públicas dos módulos.
