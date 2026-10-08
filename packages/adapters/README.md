# packages/adapters

Um pacote por provedor externo (djen, ses, smtp, s3, anthropic, fcm/apns para push, whatsapp...), cada um implementando uma porta de packages/integracoes.

Implementado em: HU09, HU17, HU21, HU30. Siga o [CLAUDE.md](/CLAUDE.md) e a página Arquitetura do PrejuZero.

Adaptadores: [`anthropic`](anthropic/README.md), [`s3`](s3/README.md), [`ses`](ses/README.md), [`smtp`](smtp/README.md). Para criar um novo: [docs/guias/como-criar-um-adaptador.md](../../docs/guias/como-criar-um-adaptador.md).
