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

Falsos positivos descartados: prazo já vencido ("prazo de 15 dias já decorrido", "decorreu o prazo de 5 dias"), tempo passado ("há 15 dias"), pena ("10 dias-multa", "2 anos de reclusão") e idade ("70 anos de idade"). "Sob pena de prisão" depois do prazo não descarta.

## Qualidade (PZ-155)

`domain/corpus.test.ts` traz o corpus fictício de frases (numéricas, por extenso, mistas e falsos positivos) com o trecho exato esperado. Medição em 08/10/2026: prazo citado com 35 frases, precisão 100% e revocação 100%; regras de exemplo com 6 de 10 frases classificadas sem IA e precisão 100% (meta ≥ 99%). A precisão das regras reais da curadoria sobre teores anonimizados é medida no conjunto de avaliação da HU22.
