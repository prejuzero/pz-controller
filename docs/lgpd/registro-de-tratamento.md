# Registro das operações de tratamento de dados pessoais (LGPD)

> **Rascunho técnico para validação do encarregado (DPO) e do jurídico (HU38, PZ-226).** O inventário abaixo foi levantado do código e do banco em 07/10/2026. Bases legais, finalidades e prazos marcados como _a validar_ são propostas da engenharia: só valem depois da aprovação do DPO, registrada neste arquivo por PR.

## 1. Papéis

- **Escritório (cliente do PrejuZero):** controlador dos dados de clientes, processos e publicações dos seus processos.
- **PrejuZero:** operador desses dados; controlador dos dados de conta, autenticação, faturamento e segurança dos usuários. _A validar._
- **Encarregado (DPO):** contato publicado em `/privacidade` (`NEXT_PUBLIC_ENCARREGADO_EMAIL`). _Pendente de definição._

## 2. Inventário por módulo

| Módulo             | Tabelas                                                                                      | Dados pessoais                                                                                      | Titulares                    | Finalidade                          | Base legal (LGPD art. 7)                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| identidade         | `usuario`, `usuario_perfil`, `sessao_dispositivo`                                            | nome, e-mail, hash de senha (Argon2id), segredo TOTP cifrado, dispositivos                          | usuários do escritório       | autenticação e controle de acesso   | execução de contrato (_a validar_)                                            |
| identidade         | `acesso`                                                                                     | IP, navegador, data e resultado do login                                                            | usuários                     | segurança e prova de acesso         | obrigação legal / legítimo interesse (_a validar_)                            |
| cadastro           | `advogado`, `oab`                                                                            | nome, CPF, celular, e-mails adicionais, inscrições na OAB                                           | advogados                    | monitorar publicações e notificar   | execução de contrato (_a validar_)                                            |
| cadastro           | `cliente`, `processo`                                                                        | nome e CPF/CNPJ do cliente; número do processo, tribunal, comarca                                   | clientes do escritório       | controle de prazos do escritório    | operação em nome do controlador (escritório)                                  |
| captura            | `alvo_monitoramento`, `alvo_assinante`, eventos `CapturaConcluida`                           | OAB, número do processo; teor de publicações oficiais (nomes de partes)                             | advogados, partes            | captura de intimações no DJEN       | operação em nome do controlador; dados de fonte pública oficial (_a validar_) |
| notificações       | `notificacao`, `consentimento_canal`, `preferencia_notificacao`, `destino_push`, `supressao` | e-mails e tokens de destino, histórico de envio, consentimentos                                     | usuários                     | avisos de prazo e de segurança      | execução de contrato; consentimento para push e WhatsApp (_a validar_)        |
| termos             | `aceite_documento`                                                                           | IP e navegador no aceite                                                                            | usuários                     | prova do aceite dos termos          | cumprimento de obrigação / exercício regular de direitos (_a validar_)        |
| privacidade        | `exportacao_dados`, `encerramento_conta`, arquivos em `pz-arquivos`                          | pedido e arquivos exportados (7 dias)                                                               | usuários, escritório         | direitos do titular (art. 18)       | obrigação legal                                                               |
| auditoria          | `evento_auditoria`, `auditoria_dado_pessoal` (ADR-018)                                       | IP, navegador e valores marcados como pessoais, fora do hash                                        | usuários e terceiros citados | trilha imutável de mudanças (prova) | obrigação legal / exercício regular de direitos (_a validar_)                 |
| IA (`packages/ia`) | nenhuma tabela própria                                                                       | teor de publicação enviado ao modelo, com CPF, CNPJ, e-mail, CEP e telefone trocados por marcadores | partes citadas               | classificação do ato e resumo       | operação em nome do controlador (_a validar_)                                 |
| observabilidade    | logs, traces, Sentry                                                                         | identificadores técnicos; CPF, senha, token e teor sigiloso são removidos (`sanitizar`)             | usuários                     | operação e segurança                | legítimo interesse (_a validar_)                                              |

## 3. Compartilhamento (suboperadores)

| Suboperador                                  | Uso                                             | Situação                                                       |
| -------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| Nuvem (AWS, sa-east-1, ADR-010)              | banco, filas, arquivos, cópia WORM da auditoria | planejado; hoje só ambiente local                              |
| Provedor de e-mail (SMTP; Amazon SES)        | envio de avisos                                 | local: Mailpit; SES planejado                                  |
| Provedor de IA (Anthropic, via `ProvedorIA`) | classificação e resumo de publicações           | planejado; contrato sem retenção para treino exigido (seção 4) |
| Sentry                                       | captura de erros, com dados sanitizados         | opcional por ambiente                                          |
| CNJ / DJEN                                   | fonte pública de publicações (só leitura)       | em uso                                                         |

## 4. Não uso de dados para treino de modelos

Dados de clientes **nunca** treinam nem avaliam modelos sem anonimização (CLAUDE.md, seções 3 e 11). Provedores de IA só são contratados **sem retenção para treino**; o conjunto de avaliação (`eval/`) usa apenas dados anonimizados. Cláusula a constar nos termos de uso e no contrato com o provedor (_a validar pelo jurídico_).

## 5. Retenção (decisões do produto em 07/10/2026, a confirmar com o jurídico)

| Dado                                                                                              | Prazo                       | Mecanismo                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| Registros de acesso (login, IP, navegador)                                                        | 1 ano                       | job `privacidade.aplicar-retencao` (`RETENCAO_ACESSOS_DIAS`) |
| Arquivos de exportação                                                                            | 7 dias para download        | link assinado; removidos no encerramento                     |
| Encerramento da conta                                                                             | 30 dias de carência         | job `privacidade.efetivar-encerramentos`                     |
| Dados de negócio do escritório encerrado                                                          | apagados ao fim da carência | função `pz_efetivar_encerramento`                            |
| Provas pseudonimizadas (aceites, notificações, acessos, consentimentos, dados pessoais da trilha) | 5 anos após o encerramento  | `pz_expurgar_provas` (`RETENCAO_PROVAS_DIAS`)                |
| Trilha de auditoria (`evento_auditoria`)                                                          | 5 anos (provisório)         | pendente: ADR de expurgo por partição                        |
| Outbox de eventos                                                                                 | 30 dias                     | limpeza diária do outbox                                     |

## 6. Direitos do titular (art. 18)

Confirmação e acesso: `GET /v1/termos/aceites`, Configurações > Segurança e Privacidade. Portabilidade: exportação JSON e CSV (`/v1/privacidade/exportacoes`). Eliminação: encerramento da conta com carência; a trilha é pseudonimizada, não apagada (ADR-018). Correção: perfil e cadastro no portal. Revogação de consentimento: Configurações > Notificações (push e WhatsApp).

## 7. Segurança (art. 46)

RLS por tenant em toda tabela de negócio (ADR-003); 2FA obrigatório e Argon2id (ASVS nível 2); segredos cifrados (AES-256-GCM); trilha encadeada por hash e cópia WORM (ADR-006); dados pessoais da trilha fora do hash (ADR-018); minimização no envio à IA; logs sanitizados.
