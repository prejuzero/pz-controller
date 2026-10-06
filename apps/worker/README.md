# apps/worker

Worker NestJS 12 standalone: consumidores de eventos (`@Consome`), relay do outbox e, a partir da HU10, filas BullMQ. Nenhuma regra de negócio aqui (CLAUDE.md, seção 6).

## Rodar

```bash
pnpm infra:up
pnpm --filter @pz/worker dev   # saúde em http://127.0.0.1:3002/health/ready
```

## Filas (HU10)

Filas BullMQ sobre Redis: `eventos`, `captura`, `ingestao`, `classificacao`, `prazos`, `notificacoes`, `relatorios`, `integracoes` e `manutencao` (`src/filas/job.ts`, com tentativas e concorrência de cada uma).

```ts
export const recalcularPrazo = definirJob({
  fila: 'prazos',
  tipo: 'prazos.recalcular',
  dados: z.object({ prazoId: z.uuid() }),
});

filas.registrar(recalcularPrazo, (dados) => recalcular.executar(dados.prazoId)); // só chama o caso de uso
await filas.publicar(recalcularPrazo, { prazoId }, { tenantId }, `${prazoId}:${versao}`);
```

- **Job base**: envelope validado por Zod com o escopo (tenant ou `{ global: true, motivo }`, explícito), a chave de idempotência e o contexto de trace. A mesma chave gera o mesmo ID: repetir a publicação não duplica o job.
- **Processamento**: no tenant do job (`executarNoTenant`) e no trace de origem (`executarJob`), com métricas de duração e resultado por fila.
- **Retentativa exponencial** e, esgotadas as tentativas (ou envelope/dados inválidos), **DLQ** da fila (`<fila>-dlq`), com log, métrica `pz.fila.dlq` e alerta.
- **Desligamento**: espera os jobs em andamento até 10 s; depois fecha à força (o job volta à fila quando o lock expira e outra réplica o retoma).
- **Escala**: `WORKER_QUEUES` escolhe as filas da instância (nomes validados no boot).
- Com o Redis fora do ar, cada fila registra no máximo um erro por minuto (com a contagem dos suprimidos), e `/health/ready` responde 503.

Os testes de confiabilidade rodam com Redis real (`pnpm --filter @pz/worker test:int`).

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

O relay do outbox ainda entrega no próprio processo; o próximo PR da HU10 liga o outbox do Postgres (HU05) à fila `eventos`.

**Injeção sempre com `@Inject(Token)` explícito** (mesmo motivo da api).
