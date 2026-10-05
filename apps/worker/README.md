# apps/worker

Worker NestJS 12 standalone: consumidores de eventos (`@Consome`), relay do outbox e, a partir da HU10, filas BullMQ. Nenhuma regra de negócio aqui (CLAUDE.md, seção 6).

## Rodar

```bash
pnpm infra:up
pnpm --filter @pz/worker dev   # saúde em http://127.0.0.1:3002/health/ready
```

## Consumidores de eventos

```ts
@Injectable()
export class ConsumidorDePrazos {
  constructor(@Inject(NotificarPrazo) private readonly notificar: NotificarPrazo<Tx>) {}

  @Consome('PrazoConfirmado', { versao: 1 })
  tratar(transacao: Tx, evento: PrazoConfirmado): Promise<void> {
    return this.notificar.tratar(transacao, evento); // regra no módulo; aqui só a ligação
  }
}
```

Registre a classe na lista de provedores do `WorkerModule`. O `DespachanteDeEventos` encontra os métodos com `@Consome` e garante a entrega única por consumidor (`processarUmaVez`, chave `Classe.metodo`: renomear reprocessa eventos). Um consumidor que falha faz o lote voltar ao outbox e é retentado.

Até a HU05 e a HU10 o outbox é em memória e a entrega é no próprio processo; depois, tabela `evento_dominio` com `FOR UPDATE SKIP LOCKED` e filas BullMQ (com `WORKER_QUEUES` escolhendo as filas da instância).

**Injeção sempre com `@Inject(Token)` explícito** (mesmo motivo da api).
