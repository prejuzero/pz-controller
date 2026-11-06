# ADR-023 · Webhooks de saída: porta EntregadorWebhook, eventos públicos finos e HMAC

- **Status:** Proposto (HU49, PR 2 de 3; revisão humana pendente)
- **Data:** 2026-11-06

## Contexto

A HU49 prevê que "eventos versionados no outbox viram webhooks assinados (HMAC) com retentativa e DLQ". Os eventos de domínio são internos (ADR-004): mudam com o código e trazem dados que não devem sair do escritório (CLAUDE.md, seção 10). O envio é uma chamada a um endereço externo, escolhido pelo escritório, e toda chamada externa passa por adaptador atrás de porta (ADR-005). Uma porta de tipo novo exige ADR.

## Decisão

- **Porta `entregador-webhook`** (`EntregadorWebhook.entregar`) em `packages/integracoes`, com adaptador `@pz/adapter-webhook-http`. O desfecho volta sempre como valor (`resposta` com o status, ou `falha` por rede, timeout, endereço recusado ou redirecionamento). O endereço é do integrador: a falha de um não pode abrir o circuito do registro para todos.
- **Segurança do envio:** só POST, sem seguir redirecionamentos e com timeout de 10 s. Fora do ambiente local, só HTTPS, sem usuário e senha na URL, e nenhum endereço interno (loopback, redes privadas, link-local com o serviço de metadados, CGNAT, multicast). A checagem vale para o IP conectado, no `lookup` da conexão, então trocar o DNS no meio (rebinding) não adianta. Usa só `node:http`, `node:https` e `node:net`, sem dependência nova.
- **Eventos públicos finos** (`modules/webhooks/domain/eventos-publicos.ts`), com nome estável e versão: `prazo.sugerido`, `prazo.recalculado`, `prazo.confirmado`, `prazo.ajustado`, `prazo.cumprido`, `prazo.cancelado`, `prazo.vencido`, `publicacao.recebida` e `ciencia.confirmada`, mais `webhook.teste`. O corpo leva só identificadores (`prazoId`, `processoId`, `conteudoId`): nada de partes, teor ou datas. O integrador lê o resto pela API pública, com os escopos dele (PR 1 da HU49).
- **Assinatura:** cabeçalho `PrejuZero-Assinatura: t=<segundos>,v1=<HMAC-SHA256 hex de "t.corpo">`, mais `PrejuZero-Evento-Id` para deduplicar e `PrejuZero-Evento-Tipo`. O segredo (`whsec_…`, 256 bits) aparece uma única vez. Ele precisa ser lido para assinar, então fica cifrado (ADR-021) e não só como hash.
- **Fluxo:** consumidor no worker → uma `entrega_webhook` por assinatura ativa, na transação do consumo, única por (assinatura, evento) → job `webhooks.entregar` na fila `integracoes` (6 tentativas com espera crescente, depois DLQ). Status 2xx entrega; 4xx (fora 408 e 429) é recusa e não se repete; o resto tenta de novo. Esgotadas as tentativas, a entrega fica "falhou" na tela, com reenvio manual auditado. Teste e reenvio publicam `EntregaWebhookAgendada` pelo outbox (o caso de uso nunca enfileira direto).

## Alternativas

- **Publicar o evento de domínio inteiro:** acopla integradores ao modelo interno e vaza dados.
- **Usar `fetch`:** não permite checar o IP conectado sem dependência (`undici`) e segue redirecionamentos por padrão.
- **Retentativa dentro do registro de adaptadores:** prenderia o worker esperando; a fila já tem espera crescente e DLQ.

## Consequências

- Evento público novo entra no catálogo do módulo, com consumidor no worker. Mudar o formato exige versão nova.
- A rotação da chave de dados (ADR-021) ainda não recifra os segredos dos webhooks: fica como pendência.
- As entregas não são apagadas (só no encerramento da conta). A retenção fica para quando houver volume.
