# Checklist OWASP ASVS 4.0 — V2 (autenticação) e V3 (sessão)

HU06, card PZ-103. Mapeia cada requisito da referência (CLAUDE.md, seção 14: ASVS nível 2) para o que está implementado e para o teste que o comprova. **Revisores: conferir cada linha contra o texto oficial do ASVS 4.0.3.**

Legenda: ✅ atendido e testado · ⏳ pendente (com destino) · — não se aplica.

## V2 — Autenticação

| Seção     | Requisito (resumo)                                                            | Situação | Onde / teste                                                                                                                                |
| --------- | ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| V2.1      | Senha de 12 a 128 caracteres, sem regras de composição nem troca periódica    | ✅       | `validarNovaSenha` (contagem por grafemas) · `domain/dominio.test.ts` (propriedade)                                                         |
| V2.1      | Bloquear senhas vazadas ou comuns                                             | ⏳       | sem lista local hoje; HU72 avalia (sem serviço externo até a validação do cliente)                                                          |
| V2.1      | Colar senha e usar gerenciadores de senha                                     | ⏳       | telas na HU23                                                                                                                               |
| V2.2      | Proteção contra força bruta e automação                                       | ✅       | `@LimitarPorIp` (10/min) e bloqueio progressivo 15 min/1 h/24 h · `limite.test.ts`, `sessoes.test.ts`, `segundo-fator-casos-de-uso.test.ts` |
| V2.2      | Aviso ao titular sobre bloqueio                                               | ✅       | `ContaBloqueada` → e-mail · `redefinicao-casos-de-uso.test.ts`, `worker.int.test.ts`                                                        |
| V2.2      | Segundo fator obrigatório                                                     | ✅       | sessão `senha` só acessa rotas parciais · `auth.test.ts`                                                                                    |
| V2.4      | Hash de senha resistente (Argon2id), sal único, parâmetros recomendados       | ✅       | `HasherArgon2` (m=19 MiB, t=2, p=1, PHC) · `argon2.test.ts`                                                                                 |
| V2.5      | Recuperação por token aleatório, de uso único e com validade curta, sem dicas | ✅       | 256 bits, 30 min, GETDEL, só hash · `redefinicao-casos-de-uso.test.ts`, `identidade.int.test.ts`                                            |
| V2.5      | Recuperação não revela se a conta existe                                      | ✅       | `esqueci` sempre 204 · `auth.test.ts` (diferença de tempo pequena, mitigada pelo limite por IP)                                             |
| V2.5      | Troca de senha encerra as sessões                                             | ✅       | `RegistrarCredencial` revoga tudo · `identidade.int.test.ts`                                                                                |
| V2.8      | TOTP (RFC 6238) com janela curta e uso único                                  | ✅       | ±1 passo, último passo atômico no banco · vetores das RFCs em `segundo-fator.test.ts`, paralelo em `identidade.int.test.ts`                 |
| V2.8      | Segredo do TOTP protegido                                                     | ✅       | AES-256-GCM com tag fixa (`CHAVE_CIFRAGEM`; KMS na HU72) · `segundo-fator.test.ts`                                                          |
| V2.5/V2.8 | Códigos de recuperação de uso único, guardados como hash                      | ✅       | 10 códigos, SHA-256 · `segundo-fator-casos-de-uso.test.ts`                                                                                  |
| V2        | Mensagens genéricas, sem enumerar contas; tempo constante                     | ✅       | hash fictício sempre verificado · `sessoes.test.ts`, `auth.test.ts`                                                                         |

## V3 — Sessão

| Seção  | Requisito (resumo)                                               | Situação | Onde / teste                                                                                       |
| ------ | ---------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| V3.1   | Token de sessão nunca na URL                                     | ✅       | cookie ou `Authorization: Bearer`; link de redefinição usa fragmento `#`                           |
| V3.2   | Token novo a cada elevação (após o 2FA)                          | ✅       | `ElevarSessao` troca o token · `auth.test.ts` (token anterior deixa de valer)                      |
| V3.2   | Token com entropia ≥ 64 bits, guardado só como hash              | ✅       | 256 bits, SHA-256 no Redis · `argon2.test.ts`, `identidade.int.test.ts`                            |
| V3.3   | Logout invalida a sessão no servidor                             | ✅       | `EncerrarSessao` · `auth.test.ts`                                                                  |
| V3.3   | Expiração por inatividade e absoluta                             | ✅       | 12 h e 7 dias; acesso de dispositivo 15 min · `domain/dominio.test.ts` (propriedade)               |
| V3.3   | Ver e encerrar sessões ativas (dispositivos)                     | ✅       | `GET/DELETE /v1/auth/dispositivos` · `dispositivos-casos-de-uso.test.ts`, `identidade.int.test.ts` |
| V3.4   | Cookie Secure, HttpOnly, SameSite e prefixo `__Host-`            | ✅       | `cookies.ts` · `auth.test.ts` (flags conferidas)                                                   |
| V3.5   | Tokens de renovação revogáveis, rotativos, com detecção de reuso | ✅       | `RenovarTokens` · `dispositivos-casos-de-uso.test.ts`, `identidade.int.test.ts`                    |
| V3.5   | Tokens Bearer não são segredos estáticos de API                  | ✅       | todo Bearer é sessão com expiração e revogação                                                     |
| V3.7   | Reautenticação antes de operações sensíveis                      | ⏳       | entra com as operações sensíveis (troca de e-mail, desativar 2FA), que ainda não existem           |
| V4/V13 | CSRF em métodos que alteram estado (modo cookie)                 | ✅       | double-submit, comparação em tempo constante · `auth.test.ts`                                      |

## Pendências registradas

- Bloqueio de senhas vazadas ou comuns: lista local ou serviço (HU72, depois da validação do cliente).
- E2E (Playwright) de cadastro de 2FA, login e recuperação, com telas e axe: HU23.
- Reautenticação para operações sensíveis: com a primeira delas.
- Retenção dos registros de acesso (IP é dado pessoal, LGPD): decisão pendente do usuário.
