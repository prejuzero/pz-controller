# Módulo notificacoes (HU30)

Notificações multicanal com idempotência e supressão.

- `Notificar` (na transação de quem pede): valida os dados no template versionado, resolve a preferência e os destinatários (e-mail do usuário mais as cópias, sem os suprimidos) e grava a notificação e `NotificacaoSolicitada` no outbox. A chave `(tipo, prazo, usuário, canal, janela)` é única: pedido repetido não gera outro envio.
- `EnviarNotificacao` (worker): renderiza HTML e texto e envia pelo `EnviadorDeCanal` do canal. Já enviada, não sai de novo; o provedor recebe a mesma chave de idempotência.
- Templates em `application/templates.ts`: dados mínimos, sem partes nem teor. Mudar o texto exige uma nova versão.
- Canal novo = novo `EnviadorDeCanal` na composição e uma opção nas preferências.
- `RegistrarDesfechosDeEntrega` (worker, webhook do provedor na transação global): rejeição permanente (`bounce`) e reclamação (`spam`) entram na lista de supressão; a notificação recebe entrega, abertura ou rejeição uma vez só e publica `NotificacaoEntregue` ou `NotificacaoRejeitada` (auditada; a métrica `pz_email_rejeicoes_total` alerta o administrador).
