# packages/integracoes

Portas de integração, modelos canônicos, descritores de adaptador e erros classificados (ADR-005). Toda dependência externa do PrejuZero fica atrás de uma destas portas; o domínio compila sem nenhum adaptador instalado.

## Portas

| Porta                    | Interface               | Usada por                                         |
| ------------------------ | ----------------------- | ------------------------------------------------- |
| `fonte-publicacoes`      | `FontePublicacoes`      | captura (DJEN, DataJud, tribunais) — só lê listas |
| `canal-notificacao`      | `CanalNotificacao`      | notificações (e-mail, push, WhatsApp, SMS)        |
| `provedor-email`         | `ProvedorEmail`         | canal de e-mail (SES, SMTP)                       |
| `provedor-ia`            | `ProvedorIA`            | somente `packages/ia`                             |
| `armazenamento-arquivos` | `ArmazenamentoArquivos` | arquivos por tenant (RustFS local, S3)            |

## Regras

- **Modelo canônico com Zod:** o adaptador converte o formato do provedor (camada anticorrupção) e a saída é validada pelo schema da porta. Datas jurídicas são `LocalDate`, instantes são `Instant`.
- **Erros classificados:** o adaptador converte toda falha em `ErroTransitorio`, `ErroPermanente`, `ErroLimiteExcedido` ou `ErroCredencialInvalida`. A classe decide retentativa (`retentavel`) e circuit breaker (`indicaDegradacao`).
- **Descritor:** `definirDescritor({ id, porta, versao, capacidades, limites, requerCredenciais })`. Os limites configuram a resiliência; as capacidades informam o que é coberto automaticamente. Canais declaram `CapacidadesCanal`.
- **Arquivos por tenant:** `chaveDoArquivo(tenant, caminho)` sempre prefixa o tenant e recusa travessia de diretório.
- **Webhooks:** o adaptador implementa `ReceptorWebhook` (assinatura sobre os bytes brutos e ID externo para idempotência); o gateway é único (`/v1/webhooks/{adaptador}`).

## Registro e resiliência

```ts
const registro = new RegistroDeAdaptadores(
  { padrao: { 'armazenamento-arquivos': 's3' }, porTenant: { [tenantPiloto]: { ... } } },
  { relogio, limitador: new LimitadorRedis(redis) },
);
registro.registrar(descritorS3, () => new ArmazenamentoS3(config));
registro.validar(); // no boot: configuração errada derruba a subida
const armazenamento = registro.obter('armazenamento-arquivos', tenantId);
```

A instância entregue já vem com tudo; o adaptador não escreve nada disso:

| Camada             | Comportamento                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Bulkhead           | `limites.concorrencia` chamadas simultâneas + fila; além disso, `ErroLimiteExcedido` na hora                                                |
| Retentativa        | só erros `retentavel` (transitório, cota), backoff exponencial com jitter                                                                   |
| Circuit breaker    | abre após falhas seguidas que `indicaDegradacao`; recusa sem chamar o provedor; meio-aberto depois da janela                                |
| Rate limit         | `limites.requisicoesPorMinuto`, token bucket no Redis compartilhado entre instâncias                                                        |
| Timeout            | por tentativa; o adaptador repassa `sinalDaChamada()` ao cliente HTTP/SDK para a chamada ser cortada de verdade                             |
| Validação da saída | o resultado de cada operação é validado contra o modelo canônico; fora do contrato vira `ErroPermanente` e alerta                           |
| Telemetria e saúde | span e `pz.integracao.chamada.duracao` por chamada; `pz.integracao.circuito.estado` (alerta "integração degradada") e `registro.situacao()` |

Erro que o adaptador não classificou é tratado como defeito: `ErroPermanente`, sem retentativa, e alerta.

## Kit de contrato

`@pz/integracoes/contrato` exporta a suíte genérica de cada porta (`verificarContratoArmazenamento`), que todo adaptador executa no próprio teste de integração. Guia completo: [docs/guias/como-criar-um-adaptador.md](../../docs/guias/como-criar-um-adaptador.md).

Próximos passos da HU09: gateway de webhooks.
