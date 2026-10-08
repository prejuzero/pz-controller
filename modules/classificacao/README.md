# modules/classificacao

Classificação das publicações (HU20, HU21; ADR-008). A IA nunca devolve data: este módulo só diz **que ato é** e **que prazo o texto cita**; a data sai do motor de prazos.

| Camada         | Conteúdo                                                                              |
| -------------- | ------------------------------------------------------------------------------------- |
| `domain/`      | `classificarPorRegras` (regras rápidas), `extrairPrazosCitados`, numerais por extenso |
| `application/` | `ClassificarPorRegras` e a porta `RepositorioDeRegras`                                |
| `infra/`       | `RegrasPostgres` (tabela `regra_classificacao`) e `RegrasEmMemoria` (testes)          |

## Regras rápidas

- Dado versionado em `regra_classificacao` (global): código, versão, tipo de ato da taxonomia (HU15), padrões e confiança. Versão publicada é imutável; para mudar, cria-se uma nova versão. A vigente é a maior versão ativa de cada código.
- Padrões são expressões regulares sobre o texto **minúsculo e sem acento**; as evidências apontam para o teor original (mesmas posições).
- Vence a regra de maior confiança (empate: menor código). Regra com padrão inválido faz o caso de uso lançar.
- As regras reais são cadastradas pela curadoria; o repositório não traz regras prontas.

## Prazo citado

Lê "15 (quinze) dias", "quinze (15) dias", "cinco dias úteis", "48 horas", "2 (dois) meses". Unidade ausente vira `dias` com `unidadeImplicita`; algarismo e extenso divergentes viram o **menor** valor com `divergente` (na dúvida, a data mais cedo; CLAUDE.md, seção 4.4). Quem decide a contagem é o motor.
