# PrejuZero — Especificação do Sistema e Prompts de Implementação

> Transcrição em Markdown do documento "PrejuZero — Especificação do Sistema e Prompts de Implementação" (03/10/2026, @Edson). O PDF recebido contém as seções 1 a 7; as seções citadas no texto como 8 a 11 (incluindo os prompts da seção 9) não constavam nele.
>
> Hierarquia: este documento é a fonte de nível 4 (CLAUDE.md, seção 0). Onde o CLAUDE.md ou um ADR divergir daqui, valem o CLAUDE.md e o ADR. Divergências conhecidas: a estrutura do repositório (seção 6.2) evoluiu para a do CLAUDE.md, seção 6; o fim do prazo considera o fuso do juízo (CLAUDE.md, seção 4.5).

## 1. Visão geral

O PrejuZero é um portal web que capta automaticamente as intimações de advogados brasileiros, calcula os prazos processuais, notifica por e-mail e registra a ciência do advogado em trilha de auditoria imutável. O nome resume a promessa: nenhum prejuízo por prazo perdido.

**Público:** advogados autônomos no início; escritórios com vários usuários a partir da fase 2.

**Escopo atual:** apenas portal web e e-mail. O chatbot no WhatsApp está fora do escopo; a "conversa" foi substituída pelo menu Busca.

### Princípios do produto

1. **O sistema sugere, o advogado decide.** Todo prazo calculado precisa de confirmação humana; a responsabilidade legal é do advogado.
2. **A data nunca é calculada pela IA.** A IA interpreta textos; o cálculo é feito por um motor determinístico e testado.
3. **Nada falha em silêncio.** Fonte fora do ar, e-mail rejeitado ou conector quebrado geram alerta.
4. **Tudo deixa rastro.** Cada evento relevante entra em um log imutável e encadeado por hash.
5. **Simplicidade de uso.** Cadastro em menos de 3 minutos; o dia a dia cabe no dashboard e no e-mail.
6. **Transparência de cobertura.** O advogado sempre sabe o que é monitorado automaticamente e o que exige conferência manual.

### Como usar este documento com uma IA na IDE

O documento serve a dois leitores: a equipe, que lê as seções 1 a 8 e 10 a 11, e o assistente de IA da IDE (Claude Code, Cursor ou similar), que recebe os prompts da seção 9.

1. Salve este documento no repositório como `docs/ESPECIFICACAO.md` (exporte em Markdown). Os prompts fazem referência a ele.
2. Crie o arquivo de contexto permanente com o **Prompt 0 (prompt mestre)**. Ele vira o `CLAUDE.md` (ou `.cursorrules`) na raiz do projeto e é lido em toda sessão.
3. Execute os prompts **na ordem**, um por sessão ou por etapa. Cada um é isolado (diz o que fazer, o que não fazer e como validar) mas complementar (pressupõe as etapas anteriores concluídas).
4. Ao fim de cada etapa: rode os testes, revise o código, faça o commit e atualize o checklist do `CLAUDE.md`.
5. Nunca pule a revisão humana das etapas de cálculo de prazos, segurança e logs: são as que mais custam caro se estiverem erradas.

## 2. Requisitos funcionais

Os requisitos estão agrupados por módulo do portal. A coluna Fase indica quando cada um entra: MVP, F2 (fase 2) ou F3 (fase 3).

### 2.1 Perfis de usuário

| Perfil                      | O que faz                                                   | Fase |
| --------------------------- | ----------------------------------------------------------- | ---- |
| Advogado                    | Monitora as próprias publicações e prazos                   | MVP  |
| Administrador do escritório | Cadastra advogados, distribui prazos, vê tudo do escritório | F2   |
| Colaborador                 | Recebe prazos delegados, confirma ciência e cumprimento     | F2   |
| Administrador PrejuZero     | Assinaturas, feriados, falhas de captura, suporte           | MVP  |

### 2.2 Cadastro e monitoramento

| ID   | Requisito                                                                       | Fase |
| ---- | ------------------------------------------------------------------------------- | ---- |
| RF01 | Cadastro com nome, CPF, OAB(s) e UF (inclusive suplementares), e-mail e celular | MVP  |
| RF02 | Monitoramento automático por número da OAB                                      | MVP  |
| RF03 | Monitoramento por número CNJ, com validação do dígito verificador               | MVP  |
| RF04 | Importação de processos em lote por planilha                                    | F2   |
| RF05 | Monitoramento por nome do escritório ou sociedade                               | F2   |

### 2.3 Captura de publicações

| ID   | Requisito                                                  | Fase |
| ---- | ---------------------------------------------------------- | ---- |
| RF06 | Consulta às fontes várias vezes ao dia                     | MVP  |
| RF07 | Remoção de duplicatas entre fontes                         | MVP  |
| RF08 | Vínculo automático da publicação ao processo e ao advogado | MVP  |
| RF09 | Armazenamento do teor integral com link para a fonte       | MVP  |

### 2.4 Prazos

| ID   | Requisito                                                                                       | Fase |
| ---- | ----------------------------------------------------------------------------------------------- | ---- |
| RF10 | Identificação do tipo de ato (sentença, despacho, decisão, intimação etc.)                      | MVP  |
| RF11 | Sugestão do prazo aplicável, com fundamento legal                                               | MVP  |
| RF12 | Cálculo da data final pelo motor de regras (seção 3)                                            | MVP  |
| RF13 | Confirmação ou ajuste manual pelo advogado                                                      | MVP  |
| RF14 | Cadastro manual de prazos e compromissos                                                        | MVP  |
| RF89 | Cadastro manual assistido: colar texto ou enviar PDF da intimação; o sistema sugere ato e prazo | MVP  |
| RF90 | Campo "origem do prazo" (DJEN, manual, painel do tribunal)                                      | MVP  |
| RF91 | Marcação de processos sigilosos ou fora da cobertura automática                                 | MVP  |
| RF92 | Lembrete periódico para conferir painéis dos tribunais, com registro da conferência             | MVP  |
| RF93 | Aviso claro de cobertura no portal e nos termos                                                 | MVP  |

### 2.5 Dashboard

| ID        | Requisito                                                                                                                     | Fase |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ---- |
| RF30–RF35 | Cards: vencem hoje, próximos 7 dias, vencidos não cumpridos, novas publicações, aguardando confirmação, processos monitorados | MVP  |
| RF81      | Card "Prazos sem ciência confirmada" em destaque                                                                              | MVP  |
| RF36      | Linha do tempo dos próximos 30 dias (prazos por dia)                                                                          | MVP  |
| RF37–RF38 | Distribuição por tribunal e por tipo de ato                                                                                   | F2   |
| RF39      | Histórico mensal: no prazo, com atraso, perdidos                                                                              | F2   |
| RF40      | Carga por advogado responsável                                                                                                | F2   |
| RF41      | Lista "Próximos prazos" com dias úteis restantes                                                                              | MVP  |
| RF42      | Calendário mensal e semanal                                                                                                   | MVP  |
| RF43      | Filtro global por período, advogado, tribunal e cliente                                                                       | MVP  |
| RF44      | Atualização automática ao chegar nova publicação                                                                              | F2   |

Cada card é clicável e abre a lista já filtrada.

### 2.6 Busca

A Busca substitui o chat e tem dois modos na mesma tela.

| ID   | Requisito                                                                                | Fase |
| ---- | ---------------------------------------------------------------------------------------- | ---- |
| RF45 | Atalhos: hoje, amanhã, esta semana, próxima semana, este mês, próximos 30 dias, vencidos | MVP  |
| RF46 | Intervalo personalizado de datas                                                         | MVP  |
| RF47 | Escolha da data filtrada: vencimento, publicação ou início da contagem                   | MVP  |
| RF48 | Busca avançada com campos combináveis (lógica E)                                         | MVP  |
| RF49 | Busca rápida no topo, que reconhece número CNJ, parte ou palavra-chave                   | MVP  |
| RF50 | Filtros ativos como etiquetas removíveis                                                 | MVP  |
| RF51 | Buscas favoritas salvas                                                                  | F2   |
| RF52 | Resultados em tabela ordenável e paginada, com ações por linha                           | MVP  |
| RF53 | Exportar o resultado como relatório                                                      | MVP  |
| RF54 | Busca em linguagem natural convertida em filtros                                         | F2   |
| RF82 | Filtro por status de ciência                                                             | MVP  |

Campos da busca avançada (RF48):

| Campo                    | Tipo de busca                                           |
| ------------------------ | ------------------------------------------------------- |
| Número do processo (CNJ) | Exato ou parcial, com ou sem pontuação                  |
| Partes                   | Texto parcial                                           |
| Cliente                  | Seleção                                                 |
| Tribunal                 | Seleção                                                 |
| Vara ou órgão julgador   | Texto parcial                                           |
| Comarca                  | Seleção                                                 |
| Tipo de ato ou prazo     | Seleção múltipla                                        |
| Status do prazo          | Pendente, a confirmar, cumprido, vencido                |
| Status de ciência        | Não enviado, enviado, entregue, visualizado, confirmado |
| Advogado responsável     | Seleção                                                 |
| Número da OAB            | Exato                                                   |
| Ramo                     | Cível, trabalhista, juizado, penal                      |
| Palavra-chave no teor    | Texto livre (busca textual)                             |
| Origem                   | DJEN, manual, painel do tribunal                        |
| Período                  | Combinável com todos os anteriores                      |

### 2.7 Relatórios e exportação

| ID   | Requisito                                                                                          | Fase                              |
| ---- | -------------------------------------------------------------------------------------------------- | --------------------------------- |
| RF55 | Formatos PDF, Excel (.xlsx), CSV e .ics                                                            | MVP (PDF, Excel) / F2 (CSV, .ics) |
| RF56 | Relatórios prontos: agenda de prazos, por cliente, por processo, vencidos, desempenho, publicações | MVP (agenda) / F2 (demais)        |
| RF57 | Relatório a partir de qualquer busca                                                               | MVP                               |
| RF58 | Escolha das colunas                                                                                | F2                                |
| RF59 | Logotipo e dados do escritório no PDF                                                              | F2                                |
| RF60 | Relatórios agendados por e-mail                                                                    | F2                                |
| RF61 | Data, hora e filtro usado impressos no relatório                                                   | MVP                               |
| RF62 | Registro de cada exportação no log                                                                 | MVP                               |
| RF83 | Relatório de controle de ciência                                                                   | MVP                               |

### 2.8 E-mail

| ID        | Requisito                                                                    | Fase |
| --------- | ---------------------------------------------------------------------------- | ---- |
| RF63      | E-mail a cada nova publicação, com prazo sugerido                            | MVP  |
| RF64      | Lembretes escalonados configuráveis (padrão: 5, 2, 1 dia antes e no dia)     | MVP  |
| RF65      | Resumo diário em horário escolhido                                           | MVP  |
| RF66      | Botões "Confirmar ciência" e "Ver no portal" em todo e-mail                  | MVP  |
| RF67      | E-mails adicionais em cópia                                                  | MVP  |
| RF68–RF69 | Botão "Enviar por e-mail" em prazo, publicação, busca e relatório, com anexo | MVP  |
| RF70      | Aviso de dados sensíveis ao enviar para fora do escritório                   | MVP  |

### 2.9 Ciência e escalonamento

| ID   | Requisito                                                                                                  | Fase |
| ---- | ---------------------------------------------------------------------------------------------------------- | ---- |
| RF71 | Botão "Confirmar ciência" no portal e no e-mail                                                            | MVP  |
| RF72 | Link do e-mail abre página de confirmação; só o clique nela confirma (proteção contra varredores de links) | MVP  |
| RF73 | Token único, assinado, de uso único, válido por 7 dias                                                     | MVP  |
| RF74 | Página mostra processo, ato e vencimento antes de confirmar                                                | MVP  |
| RF75 | Confirmação em lote, com registro individual                                                               | MVP  |
| RF76 | Alteração de data registra valor anterior, novo e motivo                                                   | MVP  |
| RF77 | Lembretes continuam e se intensificam até a confirmação                                                    | MVP  |
| RF78 | Destaque e aviso no login para prazos sem ciência                                                          | MVP  |
| RF79 | Escalonamento para responsável alternativo                                                                 | F2   |
| RF80 | Titular vê a ciência de colaboradores                                                                      | F2   |

Estados de ciência: **enviado → entregue → aberto (indício) → visualizado no portal (indício) → ciência confirmada → cumprido**. Só os dois últimos valem como ciência; abertura de e-mail por pixel não é confiável.

### 2.10 Auditoria

| ID   | Requisito                                                                              | Fase |
| ---- | -------------------------------------------------------------------------------------- | ---- |
| RF84 | Registro de todos os eventos do ciclo de vida do prazo                                 | MVP  |
| RF85 | Cada registro: data/hora com fuso, usuário, evento, canal, IP, navegador, antes/depois | MVP  |
| RF86 | Aba "Histórico" no detalhe do prazo                                                    | MVP  |
| RF87 | Exportação do histórico em PDF com verificação de integridade                          | MVP  |
| RF88 | Administrador do escritório vê logs de todos; advogado vê os seus                      | F2   |

### 2.11 Conectores de tribunais

| ID          | Requisito                                                                                                                     | Fase |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | ---- |
| RF94–RF99   | Termo de autorização por tribunal: aceite registrado, revogação imediata, renovação a cada 6 meses, novo aceite a cada versão | F2   |
| RF100–RF101 | Conectores por sistema processual, com status e mapa de cobertura                                                             | F2   |
| RF102       | Modo somente leitura obrigatório, sem disparar ciência                                                                        | F2   |
| RF103       | Cruzamento com o DJEN e alerta de divergência                                                                                 | F2   |
| RF104       | Frequência moderada de consulta                                                                                               | F2   |
| RF105       | Fluxo assistido de 2FA                                                                                                        | F2   |
| RF106       | Detecção de falhas com retorno ao lembrete manual                                                                             | F2   |
| RF107       | Relatório de acessos do robô visível ao advogado                                                                              | F2   |

### 2.12 Menu do portal

1. Dashboard
2. Prazos
3. Publicações
4. Busca
5. Processos
6. Calendário
7. Relatórios
8. Configurações (perfil, OABs, notificações, feriados locais, usuários, autorizações de tribunais)

## 3. Regras de negócio do cálculo de prazos

O motor de prazos é código puro, sem IA, com 100% de cobertura de testes nas regras abaixo e revisão de um advogado curador antes de qualquer liberação.

| ID   | Regra                                                                                                               | Fundamento                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| RN01 | Prazos cíveis em dias úteis; exclui o dia do começo e inclui o do vencimento                                        | CPC, arts. 219 e 224                                           |
| RN02 | Suspensão de prazos de 20 de dezembro a 20 de janeiro                                                               | CPC, art. 220                                                  |
| RN03 | DJEN: publicação = primeiro dia útil após a disponibilização; prazo começa no dia útil seguinte à publicação        | Lei 11.419/2006, art. 4º, §§3º e 4º                            |
| RN04 | Intimação pelo portal: ciência tácita após 10 dias corridos sem abertura                                            | Lei 11.419/2006, art. 5º, §3º                                  |
| RN05 | Calendário em três níveis (nacional, estadual/municipal, forense por tribunal) mais suspensões por portaria         | Atos de cada tribunal                                          |
| RN06 | Prazo em dobro: Fazenda Pública, Defensoria e MP; litisconsortes com procuradores distintos apenas em autos físicos | CPC, arts. 180, 183, 186 e 229                                 |
| RN07 | Trabalhista e juizados em dias úteis; processo penal em dias corridos                                               | CLT, art. 775; Lei 9.099/1995 (Lei 13.728/2018); CPP, art. 798 |
| RN08 | Vencimento em dia sem expediente ou com indisponibilidade do sistema prorroga para o próximo dia útil               | CPC, art. 224, §1º                                             |

### Entradas e saída do motor

**Entradas:** tipo de ato, ramo, tribunal, comarca, data de disponibilização (ou de ciência), quantidade de dias, unidade (úteis ou corridos), condições especiais (Fazenda, Defensoria, MP, autos físicos com litisconsortes).

**Saída:** data de publicação considerada, data de início da contagem, data final, lista de dias desconsiderados com o motivo de cada um (feriado X, recesso, portaria Y) e os dispositivos legais aplicados. Essa memória de cálculo aparece no detalhe do prazo e no relatório.

### Tabela de prazos por ato

Mantida pelo curador jurídico como dado versionado, não como código. Exemplos iniciais:

| Ato                                    | Prazo | Unidade    | Fundamento           |
| -------------------------------------- | ----- | ---------- | -------------------- |
| Contestação                            | 15    | dias úteis | CPC, art. 335        |
| Apelação                               | 15    | dias úteis | CPC, art. 1.003, §5º |
| Agravo de instrumento                  | 15    | dias úteis | CPC, art. 1.003, §5º |
| Embargos de declaração                 | 5     | dias úteis | CPC, art. 1.023      |
| Manifestação genérica sem prazo fixado | 5     | dias úteis | CPC, art. 218, §3º   |
| Recurso ordinário trabalhista          | 8     | dias úteis | CLT, art. 895        |

Quando o texto da publicação fixar prazo diferente ("manifeste-se em 10 dias"), o prazo do texto prevalece sobre a tabela, e o sistema mostra os dois ao advogado.

### Calendário

Feriados e suspensões ficam em tabela própria com: data, abrangência (nacional, UF, município, tribunal, comarca), tipo (feriado, recesso, portaria, indisponibilidade), ato normativo de origem e quem cadastrou. Cada inclusão ou alteração recalcula os prazos afetados e notifica os advogados cujos vencimentos mudaram.

## 4. Requisitos não funcionais, segurança e aspectos jurídicos

### 4.1 Operação e usabilidade

| ID    | Requisito                                                                    |
| ----- | ---------------------------------------------------------------------------- |
| RNF01 | Nenhuma falha silenciosa: fonte fora do ar gera alerta ao usuário e à equipe |
| RNF02 | Disponibilidade de 99,5% ou mais, com captura redundante                     |
| RNF03 | Cadastro em menos de 3 minutos; uso diário sem treinamento                   |
| RNF04 | Portal responsivo, utilizável no celular                                     |
| RNF09 | Crescer de 10 para 1.000+ clientes sem reescrever a captura                  |

### 4.2 E-mail

| ID    | Requisito                                                                  |
| ----- | -------------------------------------------------------------------------- |
| RNF10 | Serviço transacional profissional (Amazon SES, SendGrid, Brevo ou similar) |
| RNF11 | Domínio próprio com SPF, DKIM e DMARC                                      |
| RNF12 | Webhooks de entregue, rejeitado e spam gravados no log                     |
| RNF13 | E-mail rejeitado gera aviso no portal e ao administrador                   |

### 4.3 Segurança e privacidade

| ID    | Requisito                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| RNF05 | Login com 2FA, criptografia em trânsito e em repouso, registro de acessos                                                    |
| RNF06 | LGPD: base legal, política de privacidade, termos de uso, encarregado (DPO), retenção e exclusão                             |
| RNF07 | Isolamento total entre clientes; nenhum uso de dados de clientes para treinar modelos sem previsão contratual e anonimização |
| RNF08 | Prova de quando cada publicação foi captada e cada notificação enviada e lida                                                |

### 4.4 Integridade dos logs

| ID    | Requisito                                                             |
| ----- | --------------------------------------------------------------------- |
| RNF14 | Logs somente de inclusão; ninguém edita ou apaga, nem o administrador |
| RNF15 | Encadeamento por hash (cada registro guarda o hash do anterior)       |
| RNF16 | Horário do servidor sincronizado por NTP, nunca do navegador          |
| RNF17 | Retenção definida em política e cópia de segurança separada           |
| RNF18 | Carimbo do tempo ICP-Brasil em lotes (fase 2)                         |

### 4.5 Credenciais de tribunais (fase 2)

| ID    | Requisito                                                                                   |
| ----- | ------------------------------------------------------------------------------------------- |
| RNF19 | Por padrão, nenhuma credencial armazenada; só com autorização expressa por tribunal         |
| RNF20 | Extensão local para quem usa certificado A3 (fase 3)                                        |
| RNF21 | Credenciais em cofre de segredos com criptografia por usuário                               |
| RNF22 | Decifradas só no momento do acesso, em ambiente isolado; nunca em logs ou mensagens de erro |
| RNF23 | Nenhum funcionário acessa credenciais em texto                                              |
| RNF24 | Acesso aos portais a partir de IPs fixos e identificados                                    |
| RNF25 | Teste de invasão periódico e plano de resposta a incidentes (comunicação à ANPD)            |
| RNF26 | Certificados digitais A1 e A3 não são aceitos no servidor                                   |

### 4.6 Aspectos jurídicos

- **Termos de uso:** o PrejuZero é ferramenta de apoio; a conferência e a responsabilidade pelo prazo são do advogado. Os logs de ciência são prova interna e não substituem a intimação oficial.
- **Cobertura:** o aviso de cobertura deixa claro que intimações feitas só no painel dos tribunais exigem conferência ou conector autorizado.
- **Acesso automatizado aos tribunais:** credenciais costumam ser pessoais e intransferíveis; parecer jurídico antes de ativar os conectores.
- **Seguro:** responsabilidade civil profissional para a empresa.
- **Envio a terceiros:** relatórios enviados para fora do escritório passam por confirmação (sigilo profissional).

## 5. Fontes de dados e integrações

O DJEN é a fonte principal e automática; os painéis dos tribunais são fonte secundária, acessada só com autorização do advogado, a partir da fase 2.

| Fonte                                              | Uso no PrejuZero                                                                          | Fase     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| DJEN (CNJ)                                         | Fonte principal: comunicações processuais por OAB e por processo, via API pública         | MVP      |
| DataJud (CNJ)                                      | Enriquecer metadados e movimentações; tem defasagem e não substitui a intimação           | F2       |
| Domicílio Judicial Eletrônico                      | Citações e intimações de pessoas jurídicas, se houver clientes empresariais               | F3       |
| Painéis dos tribunais (PJe, e-SAJ, eproc, Projudi) | Expedientes de processos sigilosos e intimações só no sistema, via conectores autorizados | F2       |
| Fornecedores privados (APIs de captura)            | Alternativa paga para acelerar cobertura                                                  | Avaliar  |
| Serviço de e-mail transacional                     | Notificações e envios manuais                                                             | MVP      |
| API de IA (Claude)                                 | Classificação de atos, extração de prazos do texto, busca em linguagem natural            | MVP / F2 |

### 5.1 Processos sigilosos

A intimação de processo em segredo de justiça pode sair no DJEN com dados das partes protegidos (captada normalmente) ou apenas no painel do tribunal (invisível às fontes públicas). Neste segundo caso corre o risco da ciência tácita de 10 dias. A cobertura no MVP é: cadastro manual assistido (RF89), marcação do processo como fora da cobertura (RF91) e lembrete periódico de conferência (RF92).

### 5.2 Acesso aos painéis dos tribunais (fase 2)

**Regra crítica:** o conector nunca abre o expediente de intimação, porque isso registra ciência expressa e antecipa o início do prazo. Ele lê apenas a lista de expedientes pendentes. Sistema em que isso não seja possível não recebe conector.

Fluxo: o DJEN identifica os tribunais em que o advogado atua → o sistema sugere a autorização → o advogado aceita o termo e informa as credenciais daquele tribunal → o robô consulta o painel periodicamente, cruza com o DJEN e cria os prazos faltantes com origem "painel do tribunal" → qualquer falha devolve o advogado ao lembrete manual.

| Forma de login            | Tratamento                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| CPF e senha               | Cofre criptografado                                                                                             |
| 2FA por aplicativo (TOTP) | Assistido (padrão): o sistema pede o código na hora. Automático (opcional): guarda a chave, com termo reforçado |
| 2FA por SMS ou e-mail     | Só assistido                                                                                                    |
| Certificado A3            | Impossível no servidor; extensão local na fase 3                                                                |
| Certificado A1            | Não aceito (permite assinar em nome do advogado)                                                                |
| Captcha                   | Nunca automatizado; pausa e chama o advogado ou deixa o tribunal em modo manual                                 |

Piloto recomendado: um ou dois tribunais do público inicial (por exemplo TJGO e TRT18), em modo assistido.

## 6. Arquitetura técnica

A arquitetura é um monolito modular com workers em fila: uma única aplicação organizada em módulos, com o trabalho pesado executado em segundo plano. Escalar de 10 para 1.000+ clientes é aumentar quantidades, não mudar o desenho.

Diagrama (uma API, uma fila e workers que escalam por demanda):

```
Portal web (Next.js · dashboard e busca)
        │
API PrejuZero (NestJS · autenticação e multi-cliente)
        │
Fila de tarefas (Redis + BullMQ)
        │
Workers (escalam pelo tamanho da fila):
  Captura (DJEN e conectores) · Motor de prazos (regras + IA Claude)
  Notificações (e-mail e ciência) · Relatórios (PDF, Excel e CSV)
        │
PostgreSQL (dados e logs encadeados por hash)
Armazenamento S3 (PDFs de intimações e relatórios)
Cofre de segredos (credenciais de tribunais, F2)
```

A API não guarda estado e escala horizontalmente; os workers sobem conforme o tamanho da fila. A API também lê e grava diretamente no PostgreSQL.

### 6.1 Stack

| Camada                 | Tecnologia                                                                     | Motivo                                                      |
| ---------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Linguagem              | TypeScript em todo o projeto                                                   | Uma linguagem só, tipos compartilhados entre portal e API   |
| Portal                 | Next.js, Tailwind, shadcn/ui, Recharts, TanStack Table                         | Dashboard e tabelas ricas com pouco código                  |
| API                    | NestJS                                                                         | Estrutura modular, injeção de dependências, fácil de testar |
| Banco                  | PostgreSQL 16 com row-level security                                           | Multi-cliente seguro; busca textual em português nativa     |
| ORM e migrações        | Prisma                                                                         | Migrações versionadas e tipadas                             |
| Fila                   | Redis + BullMQ                                                                 | Agendamento, novas tentativas, prioridade                   |
| Navegador automatizado | Playwright (fase 2)                                                            | Conectores dos tribunais                                    |
| Relatórios             | Playwright (PDF a partir de HTML), ExcelJS                                     | PDF fiel ao layout; Excel nativo                            |
| E-mail                 | Amazon SES (ou similar)                                                        | Custo baixo, webhooks de entrega                            |
| IA                     | API do Claude (Haiku para classificar, Sonnet para busca em linguagem natural) | Custo por tarefa                                            |
| Nuvem                  | AWS São Paulo (sa-east-1) ou PaaS com Postgres e containers no início          | LGPD e latência                                             |
| Testes                 | Vitest, Playwright (E2E)                                                       | Mesmo ecossistema                                           |
| Observabilidade        | Sentry, logs estruturados, métricas da fila                                    | Nenhuma falha silenciosa                                    |

A stack é uma recomendação; se a equipe preferir Python (FastAPI), o desenho e os prompts continuam válidos trocando os nomes das ferramentas.

### 6.2 Estrutura do repositório

> Substituída pela estrutura do CLAUDE.md, seção 6 (módulos de domínio em `modules/`, bibliotecas técnicas em `packages/`). Mantida aqui como registro do documento original.

```
prejuzero/
├── CLAUDE.md                 # prompt mestre (contexto permanente da IA)
├── docs/ESPECIFICACAO.md     # este documento
├── apps/
│   ├── web/                  # Next.js (portal)
│   ├── api/                  # NestJS (API REST)
│   └── worker/               # processadores da fila
├── packages/
│   ├── prazos/               # motor de prazos (puro, sem IO)
│   ├── calendario/           # feriados e suspensões
│   ├── db/                   # schema Prisma, migrações, RLS
│   ├── auditoria/            # log imutável encadeado
│   ├── ia/                   # cliente da IA, prompts, avaliação
│   ├── fontes/               # cliente DJEN e conectores
│   └── shared/               # tipos, validação CNJ, utilitários
├── eval/                     # conjunto de avaliação anotado
└── infra/                    # docker-compose, IaC, CI
```

### 6.3 Modelo de dados principal

Toda tabela de negócio tem `tenant_id` (escritório ou advogado autônomo) e política de row-level security.

| Entidade                  | Campos principais                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tenant                    | id, nome, tipo (autônomo, escritório), plano, logotipo                                                                                                              |
| usuario                   | id, tenant_id, nome, cpf, email, emails_adicionais, perfil, 2fa, preferências de notificação                                                                        |
| oab                       | id, usuario_id, numero, uf, tipo (principal, suplementar)                                                                                                           |
| cliente                   | id, tenant_id, nome, documento                                                                                                                                      |
| processo                  | id, tenant_id, numero_cnj, tribunal, orgao, comarca, ramo, sigiloso, cobertura, cliente_id                                                                          |
| publicacao                | id, hash_conteudo, fonte, data_disponibilizacao, data_publicacao, teor, url_fonte, processo_id                                                                      |
| publicacao_destinatario   | publicacao_id, oab_id, lida_em                                                                                                                                      |
| prazo                     | id, tenant_id, processo_id, publicacao_id, tipo_ato, dias, unidade, inicio, vencimento, memoria_calculo, fundamento, origem, status, status_ciencia, responsavel_id |
| notificacao               | id, prazo_id, usuario_id, canal, tipo, enviada_em, entregue_em, aberta_em, rejeitada_em                                                                             |
| token_ciencia             | id, prazo_id, usuario_id, hash_token, expira_em, usado_em                                                                                                           |
| feriado                   | id, data, abrangencia, uf, municipio, tribunal, tipo, ato_normativo                                                                                                 |
| tabela_prazo              | id, tipo_ato, ramo, dias, unidade, fundamento, versao                                                                                                               |
| evento_auditoria          | id, tenant_id, prazo_id, usuario_id, tipo, canal, ip, user_agent, antes, depois, criado_em, hash_anterior, hash                                                     |
| busca_salva               | id, usuario_id, nome, filtros (JSON)                                                                                                                                |
| autorizacao_tribunal (F2) | id, usuario_id, tribunal, versao_termo, aceita_em, revogada_em, expira_em, ref_cofre                                                                                |

A publicação é armazenada uma vez (deduplicada por hash) e ligada a quantos advogados forem destinatários: um escritório com 10 advogados na mesma intimação gera uma captura e uma classificação.

### 6.4 Pontos de escala

- `evento_auditoria` particionada por mês.
- Captura agendada por OAB, não por cliente, com deduplicação antes da IA.
- Índices compostos por `tenant_id` + data de vencimento e índice de busca textual em `publicacao.teor`.
- Banco: escala vertical primeiro, réplica de leitura para relatórios depois.

## 7. Estratégia de IA

O PrejuZero não treina modelo próprio: usa um modelo de linguagem pronto (API do Claude) cercado por regras determinísticas, base de conhecimento, ferramentas e um conjunto de avaliação validado por advogados. A IA interpreta; o código calcula; o advogado confirma.

### 7.1 Componentes

| Componente            | O que faz                                                                                                  | Usa IA?      | Fase |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------ | ---- |
| Motor de prazos       | Calcula datas a partir das regras da seção 3                                                               | Não          | MVP  |
| Classificador de atos | Lê a publicação e devolve JSON: tipo de ato, prazo citado no texto, partes, confiança, trecho de evidência | Sim (Haiku)  | MVP  |
| Regras rápidas        | Padrões textuais para atos frequentes, sem chamar a IA                                                     | Não          | MVP  |
| Base jurídica (RAG)   | Legislação, tabela de prazos, portarias e jurisprudência sobre contagem, citadas nas respostas             | Sim          | F2   |
| Agente de busca       | Converte linguagem natural em filtros da busca avançada, via ferramentas                                   | Sim (Sonnet) | F2   |
| Conjunto de avaliação | 200 a 300 publicações reais anonimizadas, anotadas por advogados                                           | Não          | MVP  |

### 7.2 Regras para o uso de IA

1. A IA nunca devolve data de vencimento; devolve dados que alimentam o motor.
2. Toda saída é JSON validado por schema; resposta inválida vai para "revisão manual", nunca para o advogado como certa.
3. Confiança abaixo do limite (inicial: 0,85) ou ato desconhecido gera o status "a confirmar" com destaque.
4. Cada sugestão mostra o trecho da publicação que a justifica e o fundamento legal.
5. As ferramentas do agente aplicam o filtro de `tenant_id` no código; o modelo nunca escolhe de qual cliente lê.
6. Dados de clientes não são usados para treino; o conjunto de avaliação é anonimizado.
7. Uma publicação deduplicada é classificada uma vez só, não por destinatário.

### 7.3 Ferramentas do agente de busca (fase 2)

- `buscar_prazos(filtros)` — a mesma busca avançada do portal
- `buscar_publicacoes(oab, periodo)`
- `classificar_ato(texto)`
- `calcular_prazo(tipo_ato, data, tribunal, condicoes)` — chama o motor
- `consultar_base_juridica(pergunta)`

### 7.4 Avaliação e melhoria contínua

- Metas mínimas para liberar uma versão: 98% de acerto na classificação do ato; 100% no motor de prazos.
- Toda mudança de prompt, modelo ou tabela roda contra o conjunto de avaliação no CI.
- Cada correção feita por um advogado (RF76) vira um caso para revisão do curador; se procedente, entra no conjunto e motiva ajuste.
- Ajuste fino de modelo só é considerado se houver milhares de exemplos anotados e as metas não forem atingidas com instruções e RAG.

### 7.5 Custo estimado de IA

Com 15 publicações por advogado por dia útil (~330 por mês), a classificação no Haiku 4.5 (US$ 1 de entrada e US$ 5 de saída por milhão de tokens) custa cerca de US$ 0,0045 por publicação, ou ~R$ 8 por advogado/mês. Somando ~50 buscas em linguagem natural no Sonnet 5 (US$ 2 / US$ 10), o total fica em R$ 10 a 15 por advogado/mês. Cache de prompt, regras rápidas e deduplicação podem reduzir isso pela metade. Preços de outubro de 2026: tabela oficial.
