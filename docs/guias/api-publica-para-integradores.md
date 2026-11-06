# API pública para integradores (HU49)

Para ERPs jurídicos, BI e automações que leem prazos e publicações do PrejuZero. Tudo o que está aqui roda localmente (`pnpm dev`) com dados fictícios.

## 1. Registrar a integração

Quem tem a permissão `integracoes:gerir` (advogado responsável ou administrador do escritório) registra o cliente, com os escopos de leitura de que ele precisa:

```bash
curl -X POST http://localhost:3000/v1/integracoes/clientes \
  -H "Authorization: Bearer <token da sua sessão>" \
  -H "Content-Type: application/json" \
  -d '{"nome":"ERP do escritório","escopos":["prazos:ler","publicacoes:ler"]}'
```

A resposta traz `cliente.id` (o `client_id`) e `segredo` (o `client_secret`). **O segredo aparece só nesta resposta**: guarde em um cofre. `GET /v1/integracoes/escopos` lista os escopos possíveis. Só há escopos de leitura: integração não confirma prazo, não ajusta data nem dá ciência.

## 2. Obter o token

```bash
curl -X POST http://localhost:3000/v1/oauth/token \
  -u "<client_id>:<client_secret>" \
  -d grant_type=client_credentials
```

Resposta: `{"access_token":"…","token_type":"Bearer","expires_in":900,"scope":"prazos:ler publicacoes:ler"}`. O token vale 15 minutos; peça outro quando vencer. Para restringir, envie `scope=prazos:ler`.

## 3. Usar a API

```bash
curl http://localhost:3000/v1/prazos -H "Authorization: Bearer <access_token>"
```

As rotas são as mesmas do portal (contrato em `/v1/openapi.json`). Rota que exige permissão fora dos escopos responde 403. Limite: 120 requisições por minuto por integração.

## Erros do endpoint de token

Erros em `application/problem+json`; o campo `codigo` traz o código do OAuth: `invalid_client` (401: id, segredo, integração revogada ou escritório suspenso), `invalid_scope` (400), `invalid_request` (400) e `unsupported_grant_type` (400).

## Revogar

`DELETE /v1/integracoes/clientes/{id}`: o token em uso para de valer na hora. Registro e revogação ficam na trilha de auditoria.

## Webhooks de saída

Em vez de consultar a API de tempos em tempos, o sistema do escritório pode receber um aviso a cada evento. Quem tem `integracoes:gerir` registra o endereço e os eventos:

```bash
curl -X POST http://localhost:3000/v1/integracoes/webhooks \
  -H "Authorization: Bearer <token da sua sessão>" -H "Content-Type: application/json" \
  -d '{"url":"http://localhost:4000/webhooks","descricao":"Receptor local","eventos":["prazo.confirmado","publicacao.recebida"]}'
```

A resposta traz o `segredo` (`whsec_…`) **uma única vez**. `GET /v1/integracoes/webhooks/eventos` lista os eventos. Fora do ambiente local, só endereços HTTPS públicos.

Cada evento chega como `POST` JSON:

```json
{
  "id": "…",
  "tipo": "prazo.confirmado",
  "versao": 1,
  "ocorridoEm": "2027-03-01T12:00:00.000Z",
  "dados": { "prazoId": "…", "processoId": "…" }
}
```

O corpo traz só identificadores: busque os detalhes pela API (ex.: `GET /v1/prazos/{prazoId}`). Para conferir a origem, leia `PrejuZero-Assinatura: t=<segundos>,v1=<hex>` e calcule `HMAC-SHA256(segredo, "<t>.<corpo bruto>")`. Compare em tempo constante e recuse `t` com mais de 5 minutos de diferença. Use `PrejuZero-Evento-Id` para ignorar repetições.

Responda 2xx em até 10 segundos. 4xx (fora 408 e 429) não é repetido. Erro de rede, timeout e 5xx são tentados de novo até 6 vezes, com espera crescente. Depois disso, a entrega aparece como falha em `GET /v1/integracoes/webhooks/entregas` e pode ser reenviada (`POST /v1/integracoes/webhooks/entregas/{id}/reenviar`). `POST /v1/integracoes/webhooks/{id}/testar` envia um `webhook.teste`.
