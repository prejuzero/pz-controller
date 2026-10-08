# Checklist de conformidade LGPD (HU38, PZ-227)

> Para revisão do jurídico e do encarregado. Cada item técnico aponta o teste automatizado que o comprova; os itens jurídicos dependem de parecer.

## Técnico (verificado pelo CI)

- [x] Versão nova dos termos bloqueia o uso até o aceite, e o aceite fica na trilha — `apps/api/src/termos/termos.test.ts`, `modules/termos/infra/termos.int.test.ts`.
- [x] Aceite guarda IP e navegador como prova e ninguém altera ou apaga pela aplicação — `modules/termos/infra/termos.int.test.ts`.
- [x] Exportação contém todas as seções de dados pessoais do titular (conta, perfis, acessos, dispositivos, advogado, OABs, aceites, consentimentos, preferências) e do escritório, sem segredos e sem dados de outro escritório — `modules/privacidade/infra/exportacao.int.test.ts`; fluxo ponta a ponta em `apps/web/e2e/privacidade.e2e.ts`.
- [x] Encerramento respeita 30 dias de carência e pode ser cancelado — `modules/privacidade/infra/encerramento-casos-de-uso.test.ts`.
- [x] Exclusão apaga os dados de negócio, pseudonimiza as provas, preserva o outro escritório e o verificador diário da auditoria continua aprovando a cadeia — `modules/privacidade/infra/encerramento.int.test.ts`.
- [x] Dados pessoais da trilha ficam fora do hash e são pseudonimizados sem quebrar a cadeia (ADR-018) — `modules/auditoria/infra/trilha.int.test.ts`.
- [x] Retenção: acessos com mais de 1 ano e provas de escritório encerrado há mais de 5 anos são expurgados — `modules/privacidade/infra/encerramento.int.test.ts`.
- [x] Dados enviados à IA passam por minimização e isolamento — `packages/ia/src/guardrails.test.ts`, `packages/ia/src/qa.test.ts`.

## Jurídico (pendente)

- [ ] Bases legais e papéis (controlador e operador) do [registro de tratamento](registro-de-tratamento.md).
- [ ] Prazos de retenção (acessos 1 ano; provas e trilha 5 anos) com fundamento.
- [ ] Textos dos termos de uso, da política de privacidade e do aviso de cobertura, com o contato do encarregado.
- [ ] Cláusula de não uso de dados para treino nos termos e no contrato com o provedor de IA.
- [ ] Aprovação do [RIPD inicial](ripd-inicial.md).
