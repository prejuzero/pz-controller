# Como criar um adaptador

Guia do framework de integrações (ADR-005, HU09). Um adaptador conecta um provedor externo a uma porta de `packages/integracoes`. Trocar de provedor deve ser só configuração; o domínio nunca vê o formato do provedor.

## 1. Escolha a porta

| Porta                    | Interface               | Exemplo de provedor         |
| ------------------------ | ----------------------- | --------------------------- |
| `fonte-publicacoes`      | `FontePublicacoes`      | DJEN, DataJud               |
| `canal-notificacao`      | `CanalNotificacao`      | e-mail, push, WhatsApp, SMS |
| `provedor-email`         | `ProvedorEmail`         | SES, SMTP                   |
| `provedor-ia`            | `ProvedorIA`            | Anthropic                   |
| `armazenamento-arquivos` | `ArmazenamentoArquivos` | S3, RustFS                  |

Porta nova (tipo de integração novo) exige ADR antes do código.

## 2. Crie o pacote

`packages/adapters/<provedor>`, com `package.json` (`@pz/adapter-<provedor>`), `tsconfig.json`, `vitest.config.ts` e `vitest.int.config.ts` (copie de `packages/adapters/s3`). O SDK do provedor só pode aparecer aqui (o dependency-cruiser bloqueia no resto). Dependência nova precisa de justificativa no PR: necessidade, manutenção, licença e tamanho.

## 3. Declare o descritor

```ts
export const DESCRITOR_X = definirDescritor({
  id: 'x', // estável: configuração, métricas e rota de webhook
  porta: 'fonte-publicacoes',
  versao: '1.0.0',
  capacidades: { porOab: true, porProcesso: false, webhooks: false },
  limites: { requisicoesPorMinuto: 60, concorrencia: 5, timeoutMs: 15_000 },
  requerCredenciais: true,
});
```

Os limites configuram a resiliência; as capacidades dizem ao usuário o que é coberto automaticamente. Canais declaram também `CapacidadesCanal`.

## 4. Implemente a porta convertendo para o modelo canônico

- Converta o formato do provedor no modelo da porta (camada anticorrupção). Datas jurídicas em `LocalDate`, instantes em `Instant`. O registro valida a saída contra o schema; dado fora do contrato vira erro e alerta.
- **Classifique todo erro** em `ErroTransitorio`, `ErroPermanente`, `ErroLimiteExcedido` ou `ErroCredencialInvalida` (veja `classificarErroS3`). Erro sem classificação é tratado como defeito do adaptador.
- **Não implemente retentativa, timeout, circuit breaker nem rate limit**: o registro já aplica. Desligue a retentativa do SDK e repasse `sinalDaChamada()` ao cliente HTTP/SDK para o timeout cortar a chamada.
- Nunca registre em log credencial, CPF, teor sigiloso ou o corpo das respostas.
- Conector de tribunal só lê listas: nunca abre o expediente (dispararia a ciência).
- Webhooks: implemente `ReceptorWebhook` (assinatura sobre os bytes brutos, comparação em tempo constante, ID externo para idempotência). A rota é sempre `/v1/webhooks/{id}`.

## 5. Passe no kit de contrato

No `src/<adaptador>.int.test.ts`, chame o kit da porta com o provedor local ou fixtures gravadas, sem rede externa no CI:

```ts
import { verificarContratoArmazenamento } from '@pz/integracoes/contrato';

verificarContratoArmazenamento('S3 (RustFS)', { descritor, criar, criarComCredencialInvalida, criarInalcancavel, ... });
```

O kit cobre mapeamento para o modelo canônico, classificação de erros, idempotência, isolamento por tenant e uso pelo registro. Provedores HTTP sem versão local usam fixtures gravadas (msw), a partir da HU17. Teste unitário para a conversão e a classificação de erros (cobertura ≥ 90%).

## 6. Registre e configure

```ts
registro.registrar(DESCRITOR_X, () => new AdaptadorX(config, relogio));
registro.validar(); // no boot
```

A escolha do adaptador por porta (e por tenant, como feature flag) vem da configuração (`ConfiguracaoIntegracoes`). Segredos só por variável de ambiente ou cofre.

## Checklist do PR

- [ ] Descritor com limites reais do provedor (documentação oficial)
- [ ] Conversão para o modelo canônico e classificação de erros com teste unitário
- [ ] Kit de contrato verde no CI, sem rede externa
- [ ] Nenhum segredo ou dado real em fixtures
- [ ] README do adaptador com a configuração por ambiente
