# Arquitetura do aplicativo mobile (iOS e Android)

> **Quando:** depois da primeira entrega em produção (go-live do MVP, HU40). Nada do app é construído no MVP.
> **Decisão de base:** [ADR-015](../adr/0015-multiplos-clientes-e-plataformas.md). Este documento detalha como o app será construído; decisões novas aqui marcadas como _a confirmar_ viram ADR quando o planejamento começar.
> **Cards:** épico E20 · Multiplataforma e clientes externos, marco "M6 · Mobile (pós go-live)", no quadro pz-controller.

## 1. Princípios

1. **Cliente fino.** O app só apresenta dados e coleta ações. Nenhuma regra de negócio, nenhum cálculo de prazo e nenhuma decisão de IA rodam no app (CLAUDE.md, seção 3).
2. **Mesma API, mesmos contratos.** O app consome a API `/v1` pelo cliente gerado do OpenAPI (`packages/contracts`). Se o app precisar de algo que a API não oferece, a mudança é na API, para todos os clientes.
3. **Mesmas garantias jurídicas.** Datas sempre com memória de cálculo; ciência só com ação explícita; sugestões de IA identificadas; tudo auditado com o canal `mobile`.
4. **Segurança de dispositivo perdido.** O app assume que o aparelho pode ser perdido ou roubado: dados mínimos no aparelho, criptografados, e revogação remota da sessão.

## 2. O que o MVP já deixa pronto

| Preparação                                                                                | Onde | Para o app                                 |
| ----------------------------------------------------------------------------------------- | ---- | ------------------------------------------ |
| API única, contratos neutros, cliente gerado do OpenAPI                                   | HU04 | Reuso direto de tipos e cliente TypeScript |
| Autenticação cookie + Bearer, sessões por dispositivo, revogação remota, refresh rotativo | HU06 | Login sem retrabalho na identidade         |
| Permissões exportáveis como escopos                                                       | HU07 | Escopos do token do app                    |
| Design tokens em pacote próprio                                                           | HU23 | Mesma identidade visual                    |
| Consentimento por canal e registro de destinos de push                                    | HU30 | Push sem mudar o domínio                   |
| Caminhos HTTPS estáveis (`/ciencia/{token}`, `/prazos/{id}`)                              | HU33 | Links universais                           |
| Porta `CanalNotificacao` com descritor de capacidades                                     | HU09 | Adaptadores FCM/APNs                       |

Pendente fora do MVP e pré-requisito do app: **servidor OAuth 2.1** (HU49, F2).

## 3. Stack

| Camada               | Escolha                                                                                    | Observação                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Framework            | React Native com Expo (managed workflow)                                                   | Reaproveita TypeScript, contratos e cliente gerado                                                                |
| Linguagem            | TypeScript strict, mesmo `@pz/config`                                                      | Mesmas regras de lint e fronteiras                                                                                |
| Navegação            | expo-router (rotas por arquivo)                                                            | Rotas espelham os caminhos do portal para os links universais                                                     |
| Dados                | TanStack Query + cliente gerado do OpenAPI                                                 | Mesmo padrão do portal                                                                                            |
| Formulários          | react-hook-form + schemas Zod de `packages/contracts`                                      | Validação idêntica à do portal                                                                                    |
| Visual               | `packages/design-tokens` + componentes nativos do app                                      | O design system web (`packages/ui`) não é usado no app                                                            |
| Textos               | Catálogo de mensagens pt-BR compartilhado                                                  | Nenhuma string solta                                                                                              |
| Armazenamento seguro | expo-secure-store (Keychain / Keystore)                                                    | Tokens e chaves                                                                                                   |
| Biometria            | expo-local-authentication                                                                  | Desbloqueio local da sessão                                                                                       |
| Push                 | expo-notifications com credenciais FCM e APNs próprias                                     | Envio pelo backend (HU64)                                                                                         |
| Erros e desempenho   | Sentry para React Native                                                                   | Sem dados pessoais nos eventos                                                                                    |
| Build e distribuição | EAS Build, EAS Submit e EAS Update                                                         | TestFlight, Play Console e atualizações OTA                                                                       |
| Testes               | Testes de lógica com Vitest; componentes com React Native Testing Library; E2E com Maestro | _A confirmar em ADR-017_: o runner de componentes RN pode exigir Jest (preset jest-expo), o que muda a stack fixa |

## 4. Estrutura em `apps/mobile`

```
apps/mobile/
├── app/                    # rotas (expo-router), espelhando o portal
│   ├── (auth)/             # login, desbloqueio biométrico
│   ├── (app)/
│   │   ├── index.tsx       # dashboard
│   │   ├── prazos/[id].tsx # detalhe com memória de cálculo
│   │   ├── publicacoes/    # lista e detalhe
│   │   └── ciencia/[token].tsx
│   └── _layout.tsx
├── src/
│   ├── api/                # hooks TanStack Query sobre o cliente gerado
│   ├── auth/               # OAuth 2.1 + PKCE, refresh, biometria, secure store
│   ├── push/               # registro do destino de push e tratamento de abertura
│   ├── offline/            # política de cache seguro (seção 6)
│   ├── components/         # componentes nativos sobre design-tokens
│   └── i18n/
├── e2e/                    # fluxos Maestro
├── app.config.ts           # configuração Expo por ambiente (sem segredos)
└── eas.json                # perfis de build: development, preview, production
```

As fronteiras do dependency-cruiser valem para o app: ele só importa `packages/contracts`, `packages/design-tokens` e bibliotecas de UI/cliente; nunca `modules/*` nem `packages/motor-prazos`.

## 5. Autenticação e sessão

- **OAuth 2.1 Authorization Code + PKCE** pelo navegador do sistema (ASWebAuthenticationSession no iOS, Custom Tabs no Android). O app nunca vê a senha nem o código TOTP: o login e o 2FA acontecem na página da identidade.
- **Tokens:** access token de vida curta em memória; refresh token rotativo no secure store, com detecção de reuso no servidor.
- **Biometria:** desbloqueia o refresh token localmente após inatividade (padrão: 15 min). Não substitui o 2FA do login.
- **Sessão por dispositivo:** cada instalação é uma `sessao_dispositivo` (tipo `mobile`), visível e revogável no portal e no app. Logout apaga tudo do aparelho.
- **Escopos:** `prazos:ler`, `publicacoes:ler`, `ciencia:confirmar`, `perfil:ler`, `notificacoes:gerir` (derivados do catálogo de permissões).

## 6. Dados no aparelho e uso sem rede

- **Leitura offline limitada:** lista de prazos, dashboard e detalhes visitados ficam em cache criptografado por até 24 h, com a indicação "dados de HH:MM". Teor integral de publicações sigilosas não fica em cache.
- **Ações sempre online:** confirmar ciência, ajustar ou cumprir prazo exigem conexão. Sem rede, a ação é bloqueada com mensagem clara; não há fila de ações offline (evita confirmação em data diferente da real).
- **Limpeza:** o cache é apagado no logout, na revogação remota e ao detectar troca de usuário.

## 7. Ciência e ações no app

- Mesmo caso de uso do portal (HU33), com canal `mobile` na auditoria.
- A tela de confirmação mostra processo, ato, vencimento e memória de cálculo antes do botão (RF74), e exige toque explícito (RF72).
- Confirmação em lote com o mesmo endpoint da HU34.
- Ajustes de prazo, se oferecidos no app, exigem motivo, como no portal.

## 8. Notificações push e links universais

- **Registro:** após consentimento, o app envia o token do aparelho para o destino de push da sessão (HU30). Token inválido é desativado pelo backend.
- **Conteúdo mínimo:** "Novo prazo a confirmar" ou "Prazo vence amanhã", sem partes nem teor; ao tocar, abre a tela do prazo.
- **Links universais:** o portal publica `/.well-known/apple-app-site-association` e `/.well-known/assetlinks.json`; os caminhos de e-mail e push abrem o app quando instalado e o portal quando não.

## 9. Segurança

- Referência: **OWASP MASVS** (perfil L1 no lançamento, L2 para armazenamento e autenticação).
- Nada sensível em logs, eventos do Sentry ou capturas de analytics.
- TLS obrigatório; avaliar certificate pinning _a confirmar_ (custo de rotação vs. ganho).
- Proteção da API contra clientes falsificados com App Attest (iOS) e Play Integrity (Android) _a confirmar_ na fase de lojas.
- Ocultar conteúdo na troca de apps (snapshot do app switcher) nas telas com dados de processo.

## 10. Compatibilidade de versões

- O app envia `X-Cliente: mobile/<versão>` em toda chamada.
- A API mantém uma **versão mínima suportada** por plataforma; abaixo dela, responde 426 (Upgrade Required) e o app pede atualização.
- Mudanças incompatíveis na API só em `/v2` (ADR-009); apps antigos continuam em `/v1` até a versão mínima subir.

## 11. Qualidade

- Mesmos gates do monorepo: lint, typecheck, fronteiras, testes, gitleaks e audit.
- E2E Maestro dos fluxos críticos: login, dashboard, detalhe do prazo, confirmação de ciência, abertura por push e por link.
- Acessibilidade: VoiceOver e TalkBack, tamanhos de fonte do sistema, contraste dos design tokens.
- Build de preview (EAS) em todo PR que toca `apps/mobile`.

## 12. Publicação e operação

- **Distribuição:** EAS Build e Submit; testes internos (TestFlight e Play Internal Testing) antes de cada release; lançamento gradual (staged rollout).
- **Atualizações OTA (EAS Update):** só para mudanças em JavaScript que passaram pelo mesmo CI; mudanças nativas exigem nova versão nas lojas.
- **Lojas e LGPD:** rótulos de privacidade (App Store) e Data safety (Google Play), link para a política de privacidade e **exclusão de conta dentro do app** (exigência da Apple), reaproveitando o fluxo de direitos do titular (HU38).
- **Observabilidade:** saúde das versões (falhas por versão) no Sentry; alertas por aumento de falhas após release.

## 13. Roteiro de histórias (marco M6 · Mobile, pós go-live)

| Ordem | História                                                     | Depende de                 |
| ----- | ------------------------------------------------------------ | -------------------------- |
| 1     | HU63 · Fundação do app mobile                                | HU40 (go-live), HU04, HU23 |
| 2     | HU65 · Login no app: OAuth 2.1 + PKCE, biometria e sessões   | HU63, HU49                 |
| 3     | HU66 · Dashboard e prazos no app, com cache seguro           | HU65                       |
| 3     | HU67 · Publicações e memória de cálculo no app               | HU65                       |
| 4     | HU68 · Confirmação de ciência no app                         | HU66, HU33                 |
| 4     | HU64 · Notificações push (FCM e APNs)                        | HU63, HU30                 |
| 5     | HU69 · Links universais                                      | HU63, HU33                 |
| 6     | HU70 · Publicação nas lojas, conformidade e atualizações OTA | HU68, HU64, HU69, HU38     |
| 7     | HU71 · Assistente de IA no app                               | HU61, HU65                 |
