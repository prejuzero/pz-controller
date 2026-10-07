# Módulo termos

Termos de uso, política de privacidade e cobertura com aceite versionado (HU38, LGPD).

- `documento_legal` (global, só inserção): tipo, versão (`1.0`, `1.0.1`), conteúdo e `publicado_em`. Nova redação é nova versão; a publicação ainda é feita por migração ou pelo papel sistema.
- `aceite_documento` (por tenant, RLS, só inserção para todos os papéis): usuário, documento, instante, IP e navegador, como prova. Aceite registrado na trilha (`termos.documento-aceito`) na mesma transação.
- Pendente = a versão mais recente de cada tipo publicada até o início da sessão e ainda não aceita: versão nova vale no próximo login. Enquanto houver, a API responde 403 `termos-pendentes` fora das rotas de sessão e de termos, e `GET /v1/auth/eu` traz `proximoPasso: 'aceitar-termos'`.
- Rotas: `GET /v1/termos/pendentes`, `POST /v1/termos/{id}/aceitar`, `GET /v1/termos/aceites` (histórico exportável).
