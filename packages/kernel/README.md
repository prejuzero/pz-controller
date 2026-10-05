# packages/kernel

Kernel de domínio (HU04, ADR-001 e ADR-013): `Result`, erros tipados, `Clock`, `LocalDate`, `Instant`, UUIDv7, `Entity` e `AggregateRoot`. Não depende de nenhum outro pacote do monorepo nem de infraestrutura, e tem 100% de cobertura (perfil `kernel`).

## Result

Erros de negócio esperados voltam como valor; exceções ficam para falhas inesperadas.

```ts
import { err, ok, NaoEncontrado, type Result } from '@pz/kernel';

function buscar(id: Uuid): Result<Prazo, NaoEncontrado> {
  const prazo = prazos.get(id);
  return prazo
    ? ok(prazo)
    : err(new NaoEncontrado('prazo.nao-encontrado', 'Prazo não encontrado.'));
}

const resultado = buscar(id);
if (!resultado.ok) return resultado; // o tipo estreita para Err
usar(resultado.valor);
```

## Erros de domínio

| Classe           | Categoria          | HTTP (problem+json, na API) |
| ---------------- | ------------------ | --------------------------- |
| `Validacao`      | `validacao`        | 400                         |
| `Proibido`       | `proibido`         | 403                         |
| `NaoEncontrado`  | `nao-encontrado`   | 404                         |
| `Conflito`       | `conflito`         | 409                         |
| `RegraDeNegocio` | `regra-de-negocio` | 422                         |

Todos recebem um `codigo` estável (`prazo.ja-confirmado`) e uma mensagem em pt-BR. `Validacao` lista os problemas por campo.

## Datas e instantes

- `LocalDate`: data civil sem hora nem fuso, a unidade dos prazos. Aritmética inteira no calendário gregoriano, de 0001-01-01 a 9999-12-31.
- `Instant`: ponto no tempo em UTC, em milissegundos. Texto ISO sem fuso é recusado.
- `Clock`: porta do relógio. O domínio nunca chama `Date.now()` (CLAUDE.md, seção 3); recebe um `Clock` injetado. Em testes, `FixedClock`.

```ts
import { FixedClock, hoje, Instant, LocalDate, DiaDaSemana } from '@pz/kernel';

const relogio = new FixedClock(Instant.deIso('2026-10-05T02:30:00Z'));
hoje(relogio); // 2026-10-04: em São Paulo (fuso padrão) ainda é dia 4
hoje(relogio, 'America/Rio_Branco'); // fuso do juízo (ADR-013)

const data = LocalDate.de(2026, 12, 31).maisDias(1); // 2027-01-01
data.diaDaSemana() === DiaDaSemana.sexta; // true
LocalDate.analisar('2026-02-30'); // err(Validacao 'data.invalida')
```

O kernel só faz aritmética de calendário. Contagem de prazo (dias úteis, feriados, suspensões, prorrogação) é exclusiva de `packages/motor-prazos` (CLAUDE.md, seção 4).

## Identificadores

```ts
import { gerarUuidV7, ehUuid, type Uuid } from '@pz/kernel';

const id: Uuid = gerarUuidV7(relogio); // ordenável pelo tempo de criação (RFC 9562)
```

## Entidades e agregados

```ts
class Prazo extends AggregateRoot<PrazoConfirmado> {
  confirmar(relogio: Clock): void {
    // ...regra...
    this.registrarEvento({ id: gerarUuidV7(relogio), tipo: 'PrazoConfirmado', versao: 1, tenantId, agregadoId: this.id, ocorridoEm: relogio.agora(), payload: { ... } });
  }
}

// No repositório, na mesma transação do agregado (ADR-004):
await outbox.gravar(tx, prazo.retirarEventos());
```
