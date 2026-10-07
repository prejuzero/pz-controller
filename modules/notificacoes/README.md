# Módulo notificacoes (HU30)

Notificações multicanal com idempotência e supressão.

- `Notificar` (na transação de quem pede): valida os dados no template versionado, resolve a preferência e os destinatários (e-mail do usuário mais as cópias, sem os suprimidos) e grava a notificação e `NotificacaoSolicitada` no outbox. A chave `(tipo, prazo, usuário, canal, janela)` é única: pedido repetido não gera outro envio.
- `EnviarNotificacao` (worker): renderiza HTML e texto e envia pelo `EnviadorDeCanal` do canal. Já enviada, não sai de novo; o provedor recebe a mesma chave de idempotência.
- Templates em `application/templates.ts`: dados mínimos, sem partes nem teor. Mudar o texto exige uma nova versão.
- Canal novo = novo `EnviadorDeCanal` na composição e uma opção nas preferências.
- `RegistrarDesfechosDeEntrega` (worker, webhook do provedor na transação global): rejeição permanente (`bounce`) e reclamação (`spam`) entram na lista de supressão; a notificação recebe entrega, abertura ou rejeição uma vez só e publica `NotificacaoEntregue` ou `NotificacaoRejeitada` (auditada; a métrica `pz_email_rejeicoes_total` alerta o administrador).
- `ConsultarAvisosDeEntrega` (`GET /v1/notificacoes/avisos`, faixa do portal): o usuário vê os próprios e-mails suprimidos (não recebem nada até serem trocados ou liberados pelo suporte); quem tem `usuarios:gerir` vê também quantos colegas tiveram rejeição nos últimos 7 dias. É derivado do estado, sem dispensa: o aviso some quando a causa some.
- Consentimento por canal (`ConcederConsentimento`, `RevogarConsentimento`, `ListarConsentimentos`; `/v1/notificacoes/consentimentos`): push, WhatsApp e SMS só enviam com consentimento ativo para o destino (dispositivo ou telefone E.164). O e-mail não pede consentimento: é o canal do serviço contratado. Revogar grava `revogado_em` e o registro fica (sem DELETE). Os dois casos de uso registram na trilha e publicam `ConsentimentoCanalAlterado` (sem o destino).
- Destinos de push (`RegistrarDestinoPush`, `DesativarDestinoPush`; `/v1/notificacoes/destino-push`): um token por dispositivo da sessão do app. O envio exige também o consentimento de push para aquele dispositivo. O token não vai para a trilha.
- Fora do e-mail, `renderizar` usa a versão mínima do template (avisa e leva ao portal ou app, sem número do processo), cortada em `tamanhoMaximo` e com o template aprovado quando o descritor do canal (`CapacidadesCanal`) exige.
