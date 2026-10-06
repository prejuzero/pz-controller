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

### Relay do outbox (ADR-004)

A cada `RELAY_INTERVALO_MS` (padrão 1 s), nas instâncias que processam a fila `eventos`:

1. reserva os eventos pendentes do outbox no PostgreSQL como sistema (`FOR UPDATE SKIP LOCKED`: réplicas não pegam o mesmo evento);
2. publica na fila `eventos` um job `eventos.consumir` por consumidor inscrito, no contexto de trace gravado com o evento;
3. marca o lote como publicado.

O job roda no tenant do evento, valida o evento contra o contrato em `@pz/contracts` (sem contrato → DLQ) e entrega ao consumidor com deduplicação em `evento_processado`. Se o relay cair depois de publicar, o ID determinístico do job e a deduplicação impedem efeito duplicado. Medido no teste ponta a ponta (`src/eventos/relay.int.test.ts`, Postgres e Redis reais): evento gravado numa requisição chega ao consumidor em menos de 2 s, uma vez, no mesmo trace.

O worker usa `DATABASE_URL` (pz_app, consumo no tenant) e `DATABASE_URL_SISTEMA` (pz_sistema, só o relay e jobs globais). A api não recebe a credencial com BYPASSRLS.

**Injeção sempre com `@Inject(Token)` explícito** (mesmo motivo da api).
