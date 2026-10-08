# Relatório de impacto à proteção de dados (RIPD) — versão inicial

> **Rascunho para o encarregado (DPO) — HU38, PZ-226.** Avaliação inicial da engenharia; a análise de necessidade, proporcionalidade e riscos jurídicos é do DPO.

## Escopo

Tratamento de dados de advogados, usuários de escritórios e partes citadas em publicações oficiais (DJEN), para controle de prazos processuais, notificações e prova de ciência. Inventário completo em [registro-de-tratamento.md](registro-de-tratamento.md).

## Riscos e medidas

| Risco                                    | Probabilidade | Impacto | Medidas existentes                                                                                        | Pendências                                         |
| ---------------------------------------- | ------------- | ------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Acesso de um escritório a dados de outro | baixa         | alto    | RLS forçado por tenant, testes de isolamento gerados do catálogo, papel da aplicação sem BYPASSRLS        | auditoria externa                                  |
| Vazamento de credenciais                 | média         | alto    | Argon2id, 2FA obrigatório, sessões revogáveis, limite de tentativas                                       | revisão ASVS periódica                             |
| Dado pessoal enviado ao modelo de IA     | média         | médio   | minimização (CPF, CNPJ, e-mail, CEP, telefone), teor isolado como dado, provedor sem retenção para treino | nomes por extenso não são removidos                |
| Teor sigiloso exposto em notificação     | baixa         | alto    | notificações sem partes nem teor, só aviso e link ao portal                                               | revisão dos modelos de e-mail                      |
| Retenção além do necessário              | média         | médio   | jobs de retenção e encerramento com carência                                                              | confirmação jurídica dos prazos; expurgo da trilha |
| Perda da prova (alteração da trilha)     | baixa         | alto    | cadeia SHA-256, cópia WORM, verificação diária e alerta                                                   | carimbo do tempo ICP-Brasil (F2)                   |

## Conclusão provisória

O tratamento é necessário à finalidade contratada e as medidas técnicas cobrem os principais riscos. Aprovação, parecer e eventuais ajustes: **pendentes do DPO**.
