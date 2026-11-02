# modules/ciencia (HU33)

Confirmação de ciência dos prazos, área de alto risco (CLAUDE.md, seção 15).

- **Máquina de estados** (`domain/estado.ts`): não enviado → enviado → entregue → aberto → visualizado → confirmado → cumprido. Só avança. Só confirmado e cumprido contam como ciência; entregue, aberto e visualizado são indícios.
- **Token do link** (`infra/tokens.ts`): `v1.<tenant + 256 bits aleatórios>.<HMAC-SHA256>`, em base64url. A chave do HMAC é derivada da `CHAVE_CIFRAGEM` por HKDF, com rótulo próprio. Guarda-se só o SHA-256; vale 7 dias, uma vez só, e reemitir revoga os anteriores do mesmo prazo e usuário.
- **Link no e-mail**: `EmitirLinkDeCiencia` roda na hora do envio da notificação (o token não fica na notificação).
- **Confirmar**: `ConfirmarCiencia.peloLink` (POST público com o token; o GET só mostra) e `pelaSessao` (portal ou app). O mesmo núcleo grava canal, IP, user agent e horário do servidor, a trilha e `CienciaConfirmada` na mesma transação. O módulo prazos consome o evento e marca o prazo.
