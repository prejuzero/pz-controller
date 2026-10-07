# @pz/adapter-ses

Adaptador SES (ADR-005, HU30), escolhido por configuração (`EMAIL_PROVEDOR=ses`).

- **Envio:** porta `ProvedorEmail` pela interface SMTP do SES (`email-smtp.<região>.amazonaws.com:587`, STARTTLS obrigatório), reaproveitando o adaptador SMTP. Sem SDK da AWS.
- **Webhooks de entrega:** `WebhooksSes` recebe as notificações do SES via SNS em `/v1/webhooks/ses`. Verifica a assinatura do SNS (v1 e v2) com o certificado baixado só de `sns.<região>.amazonaws.com`, aceita apenas os tópicos configurados (`SES_TOPICOS_SNS`) e confirma a inscrição do tópico.
- **Interpretação:** Bounce permanente → `rejeitado`; temporário, Reject e RenderingFailure → `falhou`; Complaint → `reclamacao`; Delivery, Open e Click → `entregue`, `aberto` e `clicado`. A correlação com o envio usa o `Message-ID` original (`mail.commonHeaders.messageId`). Tipo desconhecido e cancelamento da inscrição vão para a DLQ.

Testes: `pnpm test` (assinatura e interpretação) e `pnpm test:int` (kit `verificarContratoEmail` contra o Mailpit no lugar do endpoint do SES).
