# Guia rápido do portal PrejuZero

Para quem vai usar e validar o portal localmente: a advogada curadora e o QA. Todos os dados de exemplo aqui são fictícios.

## Ideia geral

O PrejuZero faz três coisas por você:

1. **Busca as suas intimações sozinho.** Várias vezes ao dia, consulta o Diário de Justiça Eletrônico Nacional (DJEN) pelas OABs cadastradas.
2. **Sugere o prazo de cada intimação.** O ato é identificado e a data é calculada por um motor de regras com o calendário forense, nunca pela IA.
3. **Avisa e registra.** Lembra do vencimento por e-mail e guarda tudo numa trilha de auditoria que não pode ser alterada.

**Regra de ouro:** o sistema sugere e você decide. Todo prazo nasce **"a confirmar"** e só vale depois que você o confirma.

---

## 1. Primeiro acesso

1. Abra o portal (localmente: http://localhost:3001) e clique em **Criar conta**.
2. Preencha nome, CPF, e-mail, celular, senha e a **OAB principal** (UF e número). Se tiver inscrições suplementares, inclua-as aqui ou depois.
3. Confirme o e-mail. Localmente, a mensagem chega no Mailpit: http://127.0.0.1:8025.
4. Ative a **verificação em duas etapas** com um app autenticador (Google Authenticator, Microsoft Authenticator, Authy). Guarde os códigos de recuperação.

A partir daí as suas OABs passam a ser monitoradas. Para incluir ou remover OABs: **Configurações → OABs**.

---

## 2. Como os prazos chegam sozinhos (busca automática)

Você não precisa fazer nada além de ter a OAB cadastrada.

| Etapa          | O que acontece                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Captura        | Às 7h, 9h, 11h, 13h, 15h e 17h o sistema consulta o DJEN por cada OAB do escritório.                                                                                                                                       |
| Publicações    | Cada intimação nova aparece em **Publicações**. Abrir uma publicação registra a leitura.                                                                                                                                   |
| Classificação  | O sistema identifica o tipo de ato (ex.: "contestação"). Hoje, localmente, isso é feito por regras automáticas; o que elas não reconhecem fica para você indicar.                                                          |
| Prazo sugerido | Se o ato tiver regra aprovada na tabela de prazos, a data é calculada e aparece em **Prazos**, na aba **A confirmar**, com a memória de cálculo. Sem regra aprovada, o prazo aparece sem data e você informa o vencimento. |
| Aviso          | Você recebe o e-mail de nova intimação com o prazo sugerido.                                                                                                                                                               |

Onde acompanhar: **Configurações → Cobertura** mostra a última captura de cada OAB e o que exige conferência manual.

> **O que a busca automática não alcança:** processos físicos, sigilosos ou de sistemas que não publicam no DJEN. Marque-os como cobertura **parcial** ou **manual** em **Processos**. O portal passa a lembrar você de conferi-los no painel do tribunal (menu **Processos → Conferências de painel**).

---

## 3. Como cadastrar um prazo à mão

Use quando você viu um prazo fora do DJEN, por exemplo no painel do tribunal, num ofício ou numa intimação pessoal.

1. Vá em **Prazos** e clique em **Novo prazo**.
2. Escolha o **processo**. Se ele ainda não existe, cadastre antes em **Processos → Novo processo**, com o número CNJ.
3. Opcional, mas ajuda: **cole o texto da intimação** e clique em **Analisar texto**, ou **envie o PDF** (até 10 MB). O sistema sugere o tipo de ato e o prazo citado no texto. Confira a sugestão.
4. Preencha ou confira:
   - **Tipo de ato** e **Rito** (cível, juizado, trabalhista, penal…);
   - **Dias fixados no ato**, se o juiz fixou um prazo próprio;
   - **Como soube do ato** e **Data de referência** (a data da intimação ou da ciência).
5. Clique em **Calcular**. A prévia mostra o vencimento calculado pelo motor, ou avisa que não há regra e o prazo ficará "a confirmar".
6. Marque **Confirmo esta data** e clique em **Salvar prazo**.

---

## 4. Como procurar prazos e publicações

| Onde                       | Para quê                                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**              | Visão do dia: prazos que vencem hoje, nos próximos 7 dias, vencidos, aguardando confirmação e sem ciência. Clique num card para abrir a lista. Clique numa barra de "Prazos nos próximos 30 dias" para ver os prazos daquele dia. |
| **Prazos**                 | Lista por situação, nas abas A confirmar, Pendentes, Cumpridos, Vencidos e Cancelados, com os dias úteis restantes.                                                                                                               |
| **Calendário**             | Prazos e compromissos no mês ou na semana, com feriados marcados.                                                                                                                                                                 |
| **Busca**                  | Busca avançada: combine os filtros que quiser. Todos valem juntos.                                                                                                                                                                |
| **Barra de busca do topo** | Busca rápida: cole o número do processo (com ou sem pontos) ou uma palavra do texto.                                                                                                                                              |

**Filtro do topo das telas** (Dashboard, Prazos, Calendário): período, **advogado**, tribunal e cliente. Ele fica no endereço da página, então dá para compartilhar o link com o filtro aplicado.

**Busca avançada, campos mais usados:**

- **Número da OAB** (ex.: `GO12345`): prazos em que o advogado com essa OAB é o responsável. Vale só para advogados cadastrados no escritório.
- **Número do processo**, **Cliente**, **Tribunal**, **Vara ou órgão**, **Comarca**.
- **Advogado responsável**, **Tipo de ato** (pode marcar vários), **Status do prazo**, **Status de ciência**.
- **Período**: atalhos (hoje, esta semana, próximos 30 dias, vencidos…) ou datas de/até.
- **Palavra-chave no teor**: procura no texto das intimações.

Cada filtro ativo vira uma etiqueta; clique no X para tirá-lo. O resultado pode ser **exportado** em CSV, XLSX ou PDF, ou **enviado por e-mail**.

---

## 5. O dia a dia com um prazo

Abra o prazo, clicando no vencimento na lista.

1. **Confira a memória de cálculo:** data da publicação, início da contagem, cada dia desconsiderado (fim de semana, feriado, suspensão) com o ato normativo, e os artigos de lei aplicados.
2. **Confirmar prazo:** a data passa a valer e os lembretes são programados.
3. **Ajustar:** mude o ato, o rito ou os dias (o motor recalcula) ou informe o vencimento à mão. O motivo é obrigatório e fica no histórico.
4. **Confirmar ciência:** registra que você tomou conhecimento. Na lista, dá para marcar vários e confirmar em lote.
5. **Marcar como cumprido** quando o ato for praticado. **Cancelar**, se o prazo não se aplicar.
6. **Histórico:** tudo o que aconteceu com o prazo, com quem e quando. **Exportar histórico (PDF verificável)** gera um documento que qualquer pessoa confere pelo código impresso.

Se o calendário mudar (um feriado novo, por exemplo) ou a comarca do processo for corrigida, o prazo é **recalculado sozinho**. Se a data mudar, ele volta para "a confirmar" e você recebe um aviso.

---

## 6. Avisos e configurações

- **Configurações → Notificações:** quantos dias úteis antes do vencimento lembrar (às 8h; nos dois últimos dias também às 14h, enquanto a ciência não for confirmada), horário do resumo diário e aviso de nova intimação.
- **Configurações → Perfil:** e-mails que recebem cópia das notificações.
- **Configurações → Feriados locais:** feriados e suspensões da sua comarca que valem para o escritório.
- **Configurações → Segurança:** verificação em duas etapas, sessões ativas e últimos acessos.
- **Configurações → Privacidade:** documentos aceitos, exportação dos seus dados e encerramento da conta.
- **Delegar um prazo:** no detalhe do prazo, o administrador do escritório usa **Delegar** para passá-lo a outro membro. As datas não mudam e os lembretes passam a ir para o novo responsável. No filtro do topo, **Responsável → Meus** mostra só os seus.
- **Configurações → Equipe:** convide advogados e colaboradores por e-mail (o link vale 7 dias), defina os perfis e desative quem saiu. Quem criou a conta é o administrador da equipe.
- **Configurações → Integrações:** acesso de outros sistemas à API (identificador e segredo, só leitura) e webhooks, que avisam o sistema do escritório a cada evento. O segredo aparece uma única vez. Passo a passo técnico em [api-publica-para-integradores.md](api-publica-para-integradores.md).

---

## 7. Só para a curadora: tabela de prazos e calendário

Sem regra aprovada, o sistema não calcula a data, e o prazo fica "a confirmar". Para o cálculo automático funcionar:

1. Entre com a conta de curadoria e vá em **Prazos → Tabela de prazos**.
2. **Importar CSV:** `docs/curadoria/carga/tabela-de-prazos.csv`, com os 83 atos da curadoria V2. Cada linha entra como **rascunho**.
3. No **Calendário**, importe `docs/curadoria/carga/calendario-01.csv` (686 feriados e suspensões).
4. **Outra conta de curadoria aprova** cada versão (regra dos quatro olhos: quem propôs não aprova). A coluna **Vigente hoje** mostra a versão que vale na data atual.

Localmente existem duas contas de curadoria de teste: `curadoria1@prejuzero.local` e `curadoria2@prejuzero.local`.

---

## 8. O que ainda não funciona localmente

| Item                                                    | Situação                                                                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Classificação por IA                                    | Desligada; só as regras automáticas classificam. A IA só será ligada com dados fictícios até haver um provedor sem uso dos dados para treino. |
| E-mail de verdade                                       | Localmente os e-mails vão para o Mailpit (http://127.0.0.1:8025), não para a caixa real.                                                      |
| Feriados estaduais e municipais publicados por tribunal | Fora da carga até uma decisão da curadoria; quando faltam, o sistema avisa na memória de cálculo.                                             |
| Push no celular, WhatsApp, SMS                          | Adiados (serviços pagos).                                                                                                                     |

## Contas de teste locais

Senha de todas: `demonstracao local 2026`. O 2FA é ativado no primeiro acesso.

| Conta                                                      | Para quê                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| `demonstracao@prejuzero.local`                             | Advogado do escritório de demonstração                    |
| `curadoria1@prejuzero.local`, `curadoria2@prejuzero.local` | Curadoria da tabela de prazos e do calendário             |
| `admin@prejuzero.local`                                    | Painel do administrador (filas, integrações, escritórios) |

> Ao validar com a OAB real da curadora, o banco local passa a guardar publicações reais. Elas ficam só na máquina local: não vão para o repositório, para cards ou para prints compartilhados.
