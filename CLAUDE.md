# CLAUDE.md — Regras do projeto PrejuZero (pz-controller)

Este arquivo é a lei do projeto. Todo o código é escrito por IA, e qualquer agente (Claude Code, Cursor, Codex ou outro) **deve ler e cumprir este arquivo inteiro antes de qualquer alteração**, por menor que seja.

## 0. Hierarquia de autoridade

Em caso de conflito, vale a fonte mais alta:

1. **Este arquivo (CLAUDE.md)**
2. **ADRs** em `docs/adr/` (espelho da página "Arquitetura do PrejuZero" no Notion)
3. **Padrões de engenharia** em `docs/padroes-engenharia.md` (espelho da página no Notion)
4. **Especificação** em `docs/ESPECIFICACAO.md`
5. **Card da tarefa** no quadro pz-controller (Notion)
6. Instrução pontual na conversa

Se uma instrução da conversa contrariar os níveis 1 a 4, **pare e pergunte** antes de agir. Nunca "resolva" um conflito em silêncio. Se o card estiver ambíguo ou contradisser a arquitetura, pergunte; não invente requisito.

## 1. O produto em uma frase

Portal web que capta intimações de advogados brasileiros (DJEN), calcula prazos processuais com um motor determinístico, notifica por e-mail e registra a ciência em trilha de auditoria imutável. Promessa: **nenhum prejuízo por prazo perdido**. Um erro de data pode causar dano real a um advogado e ao cliente dele: trate cada linha de código com esse peso.

## 2. Princípios inegociáveis do produto

1. **O sistema sugere, o advogado decide.** Todo prazo calculado nasce como "a confirmar" e só vale após confirmação humana.
2. **A data nunca é calculada pela IA.** A IA interpreta texto; datas saem exclusivamente de `packages/motor-prazos`.
3. **Nada falha em silêncio.** Erro de fonte, fila, e-mail ou integração gera log, métrica e alerta. Proibido `catch` vazio ou que só registra e segue sem sinalizar.
4. **Tudo deixa rastro.** Toda mudança relevante gera evento na trilha de auditoria, na mesma transação.
5. **Simplicidade de uso.** Cadastro em menos de 3 minutos; uso diário sem treinamento.
6. **Transparência de cobertura.** O usuário sempre sabe o que é monitorado automaticamente e o que exige conferência manual.

## 3. Regras absolutas

### NUNCA

- Calcular, ajustar ou "corrigir" datas de prazo fora de `packages/motor-prazos`.
- Criar, alterar ou aplicar regra de cálculo de prazo sem fundamento em norma oficial vigente, com dispositivo citado e aprovação do curador (seção 4). Nunca usar memória do modelo, suposição, costume, jurisprudência, doutrina ou fonte não oficial como base de cálculo.
- Fazer a IA devolver datas, ou usar saída de IA sem validação por schema Zod.
- Executar query de negócio sem contexto de tenant, usar papel com BYPASSRLS na aplicação, ou criar tabela com `tenant_id` sem RLS.
- Fazer UPDATE ou DELETE em `evento_auditoria`, ou criar caminho que permita isso.
- Importar internals de outro módulo (só via `index.ts` ou eventos), ou ler tabela de outro módulo.
- Colocar regra de negócio em controller, processor de fila, componente React, server action do Next.js, app mobile, servidor MCP ou adaptador de canal. Toda regra fica nos módulos e é exposta pela API (ADR-015).
- Permitir que a IA execute ação que altera estado (confirmar prazo, confirmar ciência, ajustar data) sem confirmação humana explícita (ADR-016).
- Chamar modelo de IA fora de `packages/ia` e do adaptador `ProvedorIA`, ou criar ferramenta de IA que receba o tenant como parâmetro do modelo.
- Chamar SDK ou API externa fora de um adaptador em `packages/adapters/` atrás de uma porta de `packages/integracoes`.
- Usar `Date.now()`, `new Date()` ou relógio do sistema no domínio. Use a porta `Clock`.
- Usar horário do navegador para qualquer registro. O horário vem do servidor/banco.
- Registrar em log CPF, senha, token, segredo, cookie ou teor sigiloso.
- Commitar segredos, `.env` reais ou dados reais de clientes (inclusive em testes e fixtures).
- Usar dados de clientes para treinar ou avaliar modelos sem anonimização.
- Usar `any`, `@ts-ignore` ou `eslint-disable` sem comentário justificando na mesma linha.
- Desabilitar, pular (`.skip`) ou enfraquecer teste para fazer o CI passar.
- Alterar contrato `/v1` de forma incompatível (remover ou renomear campo, mudar tipo).
- Editar migração já aplicada em `main`. Crie uma nova.
- Abrir o expediente de intimação em conector de tribunal (dispara ciência). Conectores só leem listas.
- Adicionar dependência nova sem justificar no PR (necessidade, manutenção, licença, tamanho).
- Fazer commit direto em `main`, `git push --force` em branch compartilhada ou reescrever histórico publicado.

### SEMPRE

- Ler o card da tarefa no Notion (quadro pz-controller) e confirmar que as histórias de que ela depende estão concluídas.
- Seguir os ADRs citados no card.
- Escrever ou ajustar testes junto com o código, no nível certo (ver seção 13).
- Registrar auditoria na mesma transação da mudança de negócio.
- Publicar eventos de domínio via outbox (nunca enfileirar direto de um caso de uso).
- Tornar todo job de fila e todo consumidor de evento idempotente.
- Validar toda entrada externa (HTTP, webhook, fila, IA, arquivo) com Zod.
- Usar `LocalDate` para datas jurídicas e `Instant` (UTC) para instantes. O fuso padrão do sistema é `America/Sao_Paulo`, mas o fim de prazo usa o fuso do juízo (seção 4.5).
- Rodar lint, typecheck e testes localmente antes de concluir.
- Atualizar contratos (OpenAPI, eventos), documentação e ADRs quando o comportamento mudar.
- Ao terminar, informar honestamente o que foi feito, o que ficou pendente e o que não foi testado.

## 4. Cálculo de prazos: base legal exclusiva e cenários reais

Esta seção prevalece sobre qualquer outra instrução sobre prazos. Vale para o motor (`packages/motor-prazos`), a tabela de prazos, o calendário forense, a classificação de atos, os lembretes e qualquer código que exiba ou use uma data de prazo.

### 4.1 Fontes admitidas (e somente estas)

Uma regra de cálculo só pode existir se estiver fundamentada em **norma jurídica oficial e vigente**:

1. Constituição Federal de 1988.
2. Leis federais processuais e especiais: CPC (Lei 13.105/2015), CLT, CPP, Lei 9.099/1995, Lei 12.153/2009, Lei 11.419/2006 e demais leis que fixem prazo para o ato em questão.
3. Leis de feriados: nacionais (ex.: Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023), Lei 5.010/1966 (Justiça Federal), leis estaduais e municipais.
4. Resoluções e atos normativos do CNJ e dos conselhos superiores (ex.: DJEN e Domicílio Judicial Eletrônico, indisponibilidade de sistemas).
5. Regimentos, portarias e atos dos tribunais publicados oficialmente (feriados forenses, suspensões de prazo, indisponibilidades certificadas).
6. O próprio ato judicial, quando fixa prazo para a parte (CPC, art. 218, §1º).

Fontes oficiais de consulta: planalto.gov.br, atos normativos do CNJ, diários oficiais e sites oficiais dos tribunais.

### 4.2 Fontes proibidas como base de cálculo

Memória ou "conhecimento" do modelo de IA · suposições e valores padrão sem lei · costume ou "prática do cartório" · jurisprudência e súmulas · doutrina · blogs, calculadoras de prazo de terceiros e sites não oficiais · regras "deduzidas por analogia".

Quando houver controvérsia jurisprudencial ou doutrinária relevante sobre a contagem, ela **não altera o cálculo**. O sistema exibe um aviso e o advogado decide.

### 4.3 Requisitos de toda regra, feriado ou prazo cadastrado

- Dispositivo exato (lei ou ato, artigo, parágrafo, inciso) e link para a fonte oficial.
- Vigência (início e fim). A regra aplicada é a vigente na data do ato (CPC, art. 14).
- Aprovação do advogado curador, registrada com versão.
- Casos de teste com datas reais, assinados pelo curador, antes de entrar em produção.

### 4.4 Comportamento obrigatório do sistema

- **Sem base legal cadastrada, não há cálculo automático.** O prazo fica "a confirmar" com o aviso "sem regra legal cadastrada para este ato" e o advogado informa a data. A data manual é marcada como "definida manualmente".
- **Na dúvida, a data mais cedo.** Se normas aplicáveis levarem a datas diferentes, ou se faltar um dado para decidir (ex.: rito, ente público, meio de intimação), o sistema sugere o vencimento **mais cedo**, mostra as alternativas com seus fundamentos e exige a confirmação do advogado. Nunca sugira a data mais tardia por conveniência.
- **Prazo do ato judicial prevalece** sobre a tabela quando o ato fixar prazo próprio (CPC, art. 218, §1º); sem prazo fixado nem previsto em lei, 5 dias (CPC, art. 218, §3º). Os dois valores são exibidos.
- **Toda data exibida vem com a memória de cálculo**: data considerada de publicação ou ciência, início, cada dia desconsiderado com o motivo e o ato normativo, e os dispositivos aplicados.
- **Unidades diferentes de dias** (horas, meses, anos) só são calculadas se houver regra específica cadastrada; caso contrário, "a confirmar".

### 4.5 Cenários reais que toda regra e todo teste devem considerar

- **Ramo e rito:** cível em dias úteis (CPC, art. 219); juizados em dias úteis (Lei 9.099, art. 12-A); trabalhista em dias úteis (CLT, art. 775); penal em dias corridos, com prorrogação se terminar em domingo ou feriado (CPP, art. 798); leis especiais com prazo próprio.
- **Meio de intimação:** DJEN (publicação no 1º dia útil após a disponibilização e início no dia útil seguinte: Lei 11.419, art. 4º, §§3º e 4º; CPC, art. 224, §§2º e 3º); portal eletrônico (ciência na consulta ou tácita após 10 dias corridos: Lei 11.419, art. 5º, §3º; CPC, art. 231, V); outras modalidades do CPC, art. 231, apenas por cadastro manual.
- **Calendário em todos os níveis:** feriados nacionais, estaduais e municipais da comarca, feriados forenses e da Justiça Federal, sábados, domingos e dias sem expediente forense (CPC, art. 216). Ponto facultativo só conta se houver ato do tribunal suspendendo expediente ou prazos.
- **Suspensões:** recesso de 20/12 a 20/01 conforme o ramo (CPC, art. 220; CLT, art. 775-A); portarias de suspensão; suspensões do processo informadas pelo advogado.
- **Prorrogação:** vencimento ou início em dia sem expediente, com expediente encerrado antes ou iniciado depois do horário normal, ou com indisponibilidade do sistema (CPC, art. 224, §1º; Lei 11.419, art. 10, §2º).
- **Prazo diferenciado:** Fazenda Pública, Ministério Público e Defensoria em dobro (CPC, arts. 183, 180 e 186), exceto quando a lei fixar prazo próprio para o ente (CPC, art. 183, §2º); litisconsortes com procuradores distintos apenas em autos físicos (CPC, art. 229 e §2º).
- **Fuso e horário do juízo:** o prazo termina às 24h do último dia no horário do juízo onde o ato deve ser praticado (CPC, art. 213, parágrafo único; Lei 11.419, art. 3º, parágrafo único). Tribunais em AC, AM, MT, MS, RO, RR e outros fusos devem ser tratados corretamente.
- **Casos de borda obrigatórios nos testes:** Carnaval e Quarta-feira de Cinzas conforme ato do tribunal, Semana Santa (Lei 5.010, art. 62, na Justiça Federal), Corpus Christi, feriados que caem em fim de semana, feriados encadeados, virada de ano e recesso, ano bissexto, feriado municipal só da comarca do processo, mudança de lei ou de tabela durante o prazo, recálculo após nova portaria.

### 4.6 Como a IA programadora deve agir

- Nunca escrever regra jurídica a partir da própria memória. A regra vem do card, da tabela aprovada ou de fixture assinada pelo curador, sempre com o dispositivo citado no código (`// CPC, art. 224, §1º`).
- Se faltar fundamento, se a norma for ambígua ou se o cenário não estiver coberto, **pare e pergunte**. Não preencha lacunas jurídicas por conta própria.
- Toda mudança no motor, na tabela ou no calendário traz casos de teste com datas reais do calendário oficial e passa pelos revisores e pelo curador (seção 15).

## 5. Fluxo obrigatório para qualquer tarefa

1. **Entender:** ler o card (história + tarefa), os critérios de aceite, os requisitos (RF/RN/RNF) e os ADRs citados. Ler o código existente da área.
2. **Verificar pré-requisitos:** histórias em "Depende de" concluídas? Se não, avisar antes de começar.
3. **Planejar:** para mudanças maiores que um arquivo, apresentar um plano curto (arquivos, contratos, migrações, testes) antes de codar.
4. **Testar primeiro no domínio:** no motor de prazos, na auditoria e nos value objects, escrever os testes antes da implementação.
5. **Implementar** na ordem: Dados → Domínio → Aplicação → Infra/Adaptadores → API → Front-end.
6. **Validar:** lint, typecheck, testes unitários e de integração, fronteiras (dependency-cruiser), build.
7. **Documentar:** contratos, README do módulo, ADR novo se houver decisão arquitetural.
8. **Entregar:** branch + commit no padrão + PR com o checklist da Definição de Pronto. Atualizar o status do card no Notion, se tiver acesso.

Mudança pequena (correção pontual, texto, ajuste visual) pode pular o plano, mas **nunca** pula testes e validação.

## 6. Arquitetura

Monolito modular hexagonal, com eventos internos via outbox e workers por fila, servindo múltiplos clientes (portal web, app mobile, assistentes de IA via MCP, canais de mensagem e integradores) por uma única API. IA é capacidade central, com plataforma e catálogo de ferramentas próprios. Detalhes e motivos: ADR-001 a ADR-017.

### Estrutura do repositório

```
apps/
  api/              # NestJS: controllers HTTP e composição dos módulos
  worker/           # NestJS standalone: consumidores de fila, agendador, relay de eventos
  web/              # Next.js (App Router)
  mobile/           # app React Native/Expo (futuro, ADR-015)
  mcp/              # servidor MCP: expõe o catálogo de ferramentas a assistentes de IA (futuro, ADR-016)
modules/<modulo>/
  domain/           # entidades, value objects, eventos, regras. Sem IO.
  application/      # casos de uso e portas (interfaces)
  infra/            # repositórios Prisma e adaptadores do módulo
  index.ts          # ÚNICA API pública do módulo
packages/
  kernel/           # Result, erros, Clock, LocalDate, Instant, UUIDv7, AggregateRoot
  contracts/        # schemas Zod da API e dos eventos (fonte do OpenAPI e do cliente web)
  motor-prazos/     # motor puro de cálculo de prazos. Sem IO, sem relógio, sem IA.
  integracoes/      # portas, registro de adaptadores, resiliência, kit de testes de contrato
  adapters/         # um pacote por provedor: djen, ses, smtp, s3, anthropic, fcm, whatsapp...
  db/               # schema Prisma, migrações, RLS, seeds
  ia/               # plataforma de IA: roteamento de modelos, prompts versionados, guardrails, ferramentas, observabilidade
  design-tokens/    # cores, tipografia e espaçamento compartilhados por web e mobile
  ui/               # design system web (shadcn/ui), consome design-tokens
  observability/    # logger, OpenTelemetry, Sentry
  config/           # eslint, tsconfig, vitest, schema de env
eval/               # conjunto de avaliação da IA (somente dados anonimizados)
infra/              # docker, terraform, k6
docs/               # ESPECIFICACAO.md, adr/, runbooks/
```

### Módulos

identidade · cadastro · calendario · prazos · captura · publicacoes · classificacao · notificacoes · ciencia · auditoria · busca · relatorios · administracao · assistente (F2)

### Regras de dependência (verificadas no CI pelo dependency-cruiser)

- `domain` importa apenas `packages/kernel`.
- `application` importa `domain` e declara portas; não conhece Prisma, HTTP nem SDKs.
- `infra` implementa portas; é o único lugar com Prisma, SDKs e rede.
- Módulo usa outro módulo apenas pelo `index.ts` dele ou por eventos.
- `apps/*` apenas compõem módulos.
- `packages/motor-prazos` não importa nada além de `packages/kernel`.

Novo módulo: `pnpm gen:module <nome>`. Não crie a estrutura à mão.

## 7. Stack fixa

TypeScript strict em tudo · pnpm + Turborepo · NestJS (API e worker) · Next.js App Router + Tailwind + shadcn/ui + TanStack Query/Table + Recharts · PostgreSQL 16 com RLS · Prisma · Redis + BullMQ · Zod · Vitest, Testcontainers, Playwright, fast-check, Stryker · OpenTelemetry + pino + Sentry · Docker + Terraform (AWS sa-east-1) · IA via `packages/ia` e porta `ProvedorIA` (modelos Claude por padrão, roteados por tarefa) · MCP (Model Context Protocol) para assistentes externos · pgvector para RAG e busca semântica · app mobile em React Native/Expo (quando planejado).

Trocar qualquer item desta lista exige um ADR novo aprovado por humano.

## 8. Convenções de código

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Nomes de domínio em português sem acento no código (`Prazo`, `Publicacao`, `Ciencia`, `calcularPrazo`); termos técnicos consagrados em inglês (`Repository`, `Controller`, `Processor`).
- Arquivos em kebab-case; classes e tipos em PascalCase; funções e variáveis em camelCase; tabelas e colunas em snake_case.
- Erros de negócio esperados via `Result`; exceções só para falhas inesperadas.
- Funções pequenas, sem efeitos colaterais escondidos; nenhum estado global mutável.
- Comentários explicam o porquê, não o quê. Toda regra jurídica cita o fundamento legal (ex.: `// CPC, art. 224, §1º`).
- Textos de interface em pt-BR, sempre pelo catálogo de mensagens (nunca string solta em componente).

## 9. Dados, multi-tenancy, auditoria e datas

- Toda tabela de negócio tem `tenant_id NOT NULL` + RLS ENABLE + FORCE (ADR-003). Use o helper de migração `habilitarRls`.
- O tenant vem da sessão (HTTP) ou do payload do job (worker), via AsyncLocalStorage. Acesso global só pelo cliente "sistema", com motivo explícito.
- PK UUIDv7; `criado_em` e `atualizado_em` em `timestamptz`.
- Migrações versionadas, reversíveis e no padrão expand/contract.
- Auditoria: `auditoria.registrar(tx, ...)` na mesma transação; cadeia por hash SHA-256 sobre JSON canônico (ADR-006).
- Publicações: conteúdo global deduplicado (`publicacao_conteudo`) + destinatários por tenant (ADR-014). A classificação acontece uma vez por conteúdo.
- Datas: `LocalDate` para datas jurídicas, `Instant` para instantes, `Clock` injetado (ADR-013). O fim do prazo considera o fuso do juízo do processo (seção 4.5).

## 10. Integrações externas

Toda dependência externa (fonte de publicações, e-mail, IA, armazenamento, futuros tribunais, WhatsApp, SSO, cobrança) segue o ADR-005:

1. Usar uma porta existente em `packages/integracoes`, ou criar a porta primeiro (com ADR, se for um tipo novo).
2. Implementar o adaptador em `packages/adapters/<provedor>`, convertendo para o modelo canônico.
3. Declarar o descritor (id, versão, capacidades, limites).
4. Herdar a resiliência padrão (timeout, retentativa, circuit breaker, rate limit) e a telemetria do registro.
5. Passar no kit de testes de contrato com fixtures gravadas (sem rede no CI).
6. Webhooks de entrada sempre pelo gateway `/v1/webhooks/{adaptador}`, com verificação de assinatura.

Trocar de provedor deve ser uma mudança de configuração, não de domínio.

Canais de notificação (e-mail, push, WhatsApp, SMS) são adaptadores de `CanalNotificacao`. Todo canal exige consentimento registrado por usuário, respeita as regras do provedor (ex.: templates aprovados e janela de 24 h no WhatsApp) e envia o mínimo de dados do processo: avisa e leva ao portal ou app, sem expor partes ou teor sigiloso.

## 11. IA dentro do produto

IA é capacidade central do PrejuZero (ADR-016), sempre dentro dos limites jurídicos da seção 4.

**Limites inegociáveis**

- A IA interpreta, resume, sugere e consulta. Nunca devolve data (ADR-008), nunca escolhe o fundamento legal (o fundamento vem da tabela aprovada e do motor, seção 4) e nunca confirma prazo ou ciência em nome do advogado.
- Ferramentas que alteram estado exigem confirmação humana explícita no cliente.
- Toda sugestão de IA aparece identificada como tal, com evidência (trecho e fundamento) e pode ser corrigida; correções vão para a auditoria e para a curadoria.

**Como construir qualquer funcionalidade de IA**

- Usar `packages/ia`: roteamento de modelo por tarefa (configuração), registro de prompts versionados, saída estruturada validada por Zod, guardrails, limites de custo e observabilidade. Nunca chamar SDK de IA diretamente.
- Capacidades que a IA pode usar entram no **catálogo único de ferramentas**: schema Zod, permissão exigida, auditoria, tenant aplicado no código. O mesmo catálogo serve ao assistente interno, ao servidor MCP e, quando fizer sentido, à API pública.
- Conteúdo externo (publicação, mensagem, PDF) é dado, não instrução: isole-o contra injeção de prompt e minimize dados pessoais enviados ao modelo.
- Regras rápidas determinísticas rodam antes da IA quando resolvem o caso.
- Toda funcionalidade de IA tem conjunto de avaliação próprio em `eval/` (anonimizado) e meta de qualidade; mudança de prompt, modelo, ferramenta ou taxonomia roda `pnpm eval` no CI. Classificação de atos: acerto ≥ 98%.
- Toda chamada registra modelo, versão do prompt, tokens, custo, latência e resultado da validação.
- Saída inválida → `revisao_manual`; confiança < 0,85 ou ato desconhecido → "a confirmar".
- Dados de clientes nunca treinam modelos; provedores contratados sem retenção para treino.

## 12. API e contratos

- REST JSON em `/v1`; schemas Zod em `packages/contracts` são a fonte única (ADR-009).
- Erros no formato problem+json (RFC 9457); paginação por cursor; `Idempotency-Key` em POSTs sensíveis.
- Todo endpoint declara `@RequerPermissao(...)` ou `@Publico()`.
- Todo cliente (portal, app, servidor MCP, canais) usa somente o cliente gerado a partir do OpenAPI; contratos não contêm nada específico de uma plataforma (ADR-015).
- Autenticação em dois modos com a mesma identidade: cookie + CSRF no navegador; OAuth 2.1 (Authorization Code + PKCE ou Client Credentials) para app, MCP e integradores. Permissões viram escopos.
- Links enviados por e-mail, push ou mensagem usam caminhos HTTPS estáveis, abríveis pelo app (universal links).
- Mudança incompatível só em nova versão (`/v2`).

## 13. Testes e quality gates

| Tipo                        | Onde                                  | Meta                                                                     |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| Unitário (Vitest)           | domínio e casos de uso                | ≥ 90% de linhas por módulo                                               |
| Motor de prazos             | `packages/motor-prazos`               | 100% de cobertura, mutação (Stryker) ≥ 90%, casos assinados pelo curador |
| Propriedade (fast-check)    | motor, VOs (CPF, CNJ, OAB), auditoria | obrigatório                                                              |
| Integração (Testcontainers) | repositórios, RLS, filas, outbox      | Postgres e Redis reais, sem mocks de banco                               |
| Contrato                    | adaptadores e API                     | kit de contrato; respostas validadas contra o OpenAPI                    |
| E2E (Playwright)            | fluxos críticos                       | cadastro; captura → prazo → notificação → ciência; busca; exportação     |
| Acessibilidade              | todas as telas                        | axe sem violações (WCAG 2.1 AA)                                          |
| IA                          | `eval/`                               | ≥ 98% de acerto                                                          |

O CI bloqueia o merge em qualquer falha de: lint, typecheck, testes, cobertura, fronteiras, quebra de OpenAPI, gitleaks, CodeQL/Semgrep, osv-scanner, Trivy, migrações e avaliação de IA (quando aplicável).

Bug corrigido = teste que reproduz o bug, escrito antes da correção.

## 14. Segurança e LGPD

- OWASP ASVS nível 2 como referência.
- Sessão opaca em cookie HttpOnly/Secure/SameSite + 2FA TOTP obrigatório; Argon2id para senhas.
- Segredos só em variáveis de ambiente ou cofre; criptografia de envelope para segredos e campos sensíveis.
- Tokens (ciência, recuperação de senha) guardados apenas como hash, de uso único e com validade.
- Rotas públicas com rate limit. Link de e-mail nunca executa ação no GET.
- Envio de dados para fora do escritório exige confirmação explícita (sigilo profissional).
- Exclusão de dados respeita a retenção legal: a auditoria é pseudonimizada, nunca apagada.

## 15. Áreas de alto risco (exigem revisão humana)

Mudanças nestas áreas só são concluídas com **2 revisores humanos**. No motor e na tabela de prazos, também com o **advogado curador**. A IA deve destacar no PR que a área é de alto risco.

- `packages/motor-prazos`, tabela de prazos, calendário forense
- módulo `auditoria` e a tabela `evento_auditoria`
- módulo `identidade` (autenticação, sessão, 2FA, permissões) e políticas RLS
- módulo `ciencia` (tokens e máquina de estados)
- catálogo de ferramentas de IA, servidor MCP e autenticação OAuth de clientes externos
- criptografia, segredos, conectores de tribunais

## 16. Git, commits e PRs

- Branch curta a partir de `main`: `tipo/PZ-<id>-descricao-curta` (ex.: `feat/PZ-27-motor-regras-rn01`).
- Conventional Commits em português no assunto: `feat(prazos): calcula prorrogação por indisponibilidade (RN08)`.
- PR pequeno (idealmente até ~400 linhas), com link do card, resumo, como testar e o checklist da Definição de Pronto.
- Squash merge após CI verde e revisão.

## 17. Definição de Pronto

- [ ] Critérios de aceite do card atendidos e demonstráveis em staging
- [ ] Testes no nível adequado; cobertura não caiu; CI verde
- [ ] Contratos (OpenAPI e eventos) atualizados e versionados
- [ ] Logs, métricas e traces nos pontos novos; alertas quando aplicável
- [ ] Eventos de auditoria para mudanças relevantes
- [ ] Migrações expand/contract e reversíveis
- [ ] Documentação e ADRs atualizados
- [ ] Revisão aprovada (2 revisores + curador nas áreas de alto risco)
- [ ] Card atualizado no Notion

## 18. Comandos

Requisitos: Node.js 24 LTS (`.nvmrc`), pnpm 12 via `corepack enable` e um runtime de containers com Docker Compose v2. Mantenha esta seção atualizada.

Disponíveis:

```
pnpm install           # instalar dependências e ativar hooks de git
pnpm verify            # tudo o que o CI de qualidade roda (use antes de concluir)
pnpm lint              # ESLint em todos os pacotes + fronteiras (dependency-cruiser)
pnpm depcruise         # apenas as regras de fronteira
pnpm typecheck         # TypeScript
pnpm test              # unitários com cobertura mínima
pnpm test:int          # integração (Testcontainers; exige Docker)
pnpm build             # build de tudo (Turborepo)
pnpm format            # Prettier (format:check no CI)
pnpm infra:up          # Postgres, Redis, S3 local (RustFS) e Mailpit (infra:up:obs inclui observabilidade)
pnpm infra:up:apps     # o mesmo, mais api e worker nas imagens de produção (perfil apps)
pnpm infra:down        # para a infraestrutura local (infra:reset apaga os volumes)
pnpm dev               # infraestrutura local + apps em modo watch
pnpm gen:module <nome> # novo módulo hexagonal com exemplo ponta a ponta
pnpm db:migrate        # aplicar migrações (db:revert reverte a última; db:seed dados fictícios)
pnpm alertas:testar    # dispara um alerta controlado (com infra:up:obs no ar)
```

Previstos (criados nas histórias indicadas):

```
pnpm eval              # avaliação da IA (HU22)
pnpm e2e               # Playwright (HU23)
```

## 19. Ordem de implementação

Siga as ondas abaixo. Não comece uma história cujas dependências ("Depende de" no card) não estejam concluídas.

1. HU01 · 2. HU02, HU03, HU04 · 3. HU05, HU09, HU10, HU14 · 4. HU06, HU08, HU15 · 5. HU07, HU13, HU23 · 6. HU11, HU16, HU30 · 7. HU12, HU17, HU38, HU58 · 8. HU18, HU19 · 9. HU20, HU39 · 10. HU21 · 11. HU22, HU24 · 12. HU25, HU26, HU28, HU31, HU33 · 13. HU27, HU29, HU36, HU37 · 14. HU32, HU34, HU35 · 15. HU40

Dentro de cada história: Dados → Back-end/Integração → Front-end → Teste (o card de teste encerra a história).

### Estado atual

- [ ] **M0 · Fundação** — HU01–HU10 (concluídas: HU01, HU02, HU03, HU04, HU05; próximas: **HU09, HU10, HU14**)
- [ ] **M1 · Núcleo jurídico** — HU11–HU16
- [ ] **M2 · Captura e classificação** — HU17–HU22
- [ ] **M3 · Portal** — HU23–HU29
- [ ] **M4 · Notificação e ciência** — HU30–HU36
- [ ] **M5 · Produção** — HU37–HU40

Ao concluir uma história, marque-a aqui no mesmo PR.

## 20. Referências

- Quadro pz-controller (Notion): https://app.notion.com/p/70fb893a20ba46a28f5072ec1ed231d5
- Arquitetura do PrejuZero (ADRs): https://app.notion.com/p/3ee1523a49a981e8a513c2dd634f43a8
- Padrões de engenharia: https://app.notion.com/p/3ee1523a49a98111bc78d64045e79cc4
- Especificação: `docs/ESPECIFICACAO.md` (criada na HU01 a partir do documento "PrejuZero — Especificação do Sistema e Prompts de Implementação")

## 21. Como alterar este arquivo

Este arquivo só muda por PR dedicado, com aprovação humana explícita. A IA pode **propor** mudanças (explicando o motivo), mas nunca deve alterá-lo para acomodar uma implementação que o viola. Se uma regra estiver atrapalhando de verdade, a correção é discutir e mudar a regra, não contorná-la.
