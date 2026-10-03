# ADR-013 · Datas, horas e fusos

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

Prazos são contados em dias civis e terminam às 24h do último dia no horário do juízo (CPC, art. 213, parágrafo único; Lei 11.419/2006, art. 3º, parágrafo único). Tribunais em fusos diferentes de Brasília existem (ex.: AC, AM, MT, MS, RO, RR).

## Decisão

Instantes em UTC (`timestamptz`); datas jurídicas como data civil (`LocalDate`); o relógio é uma porta (`Clock`) injetada; o horário de auditoria vem do banco sincronizado por NTP. O fuso padrão do sistema é `America/Sao_Paulo`, mas o fim do prazo usa o fuso do juízo do processo.

## Consequências

Evita erros de virada de dia e permite testes determinísticos. O cadastro de tribunais guarda o fuso de cada juízo. (Atualiza a versão inicial deste ADR, que fixava apenas `America/Sao_Paulo`.)
