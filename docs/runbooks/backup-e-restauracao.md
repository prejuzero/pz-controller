# Runbook · Backup e restauração (ambiente local)

HU37, PZ-221. Vale para a validação local (sem AWS). PITR, snapshots gerenciados, cópia em outra conta ou região e failover ficam para quando houver staging na AWS (externo, adiado).

## Fazer backup

```bash
pnpm backup
```

- Gera `backups/<data UTC>/` com `banco.dump` (pg_dump em formato custom), `arquivos/` (cópia dos buckets `pz-arquivos`, `pz-relatorios` e `pz-auditoria-worm`) e `MANIFESTO.sha256`.
- Mantém os 7 mais recentes (`BACKUP_RETENCAO`); a pasta pode ser trocada com `BACKUP_DIR`.
- Os backups têm os dados do banco local: ficam fora do git (`/backups/` no `.gitignore`) e não saem da máquina. Com a OAB real da curadora, eles contêm publicações reais.

Para ter um ponto de recuperação próximo da meta de RPO (15 min), agende `pnpm backup` no cron da máquina. Localmente o RPO é o intervalo entre os backups.

## Restaurar e verificar

```bash
pnpm restaurar                       # o mais recente, num banco separado (prejuzero_restaurado)
pnpm restaurar backups/<data>        # um backup específico
pnpm restaurar --com-arquivos        # devolve também os buckets (sobrescreve objetos)
pnpm restaurar --banco prejuzero     # substitui o banco em uso: pare api e worker antes; pede confirmação
```

O script:

1. Confere o manifesto SHA-256 (arquivo corrompido para a restauração).
2. Recria o banco de destino e restaura com `pg_restore --exit-on-error`.
3. **Verifica a trilha de auditoria de todos os tenants, da gênese ao fim** (ADR-006), só lendo. Uma cadeia alterada ou mais curta que a âncora sai como `DIVERGENTE` e o script termina com erro.
4. Informa o tempo total (meta de RTO: 4 h; localmente leva segundos).

O bucket WORM (`pz-auditoria-worm`) não é reescrito na restauração, por causa do object lock: a cópia dele fica no backup.

## Exercício periódico

Uma vez por trimestre (ou antes de mudanças grandes): `pnpm backup && pnpm restaurar`, e registre no card da HU37 a data, o tempo e o resultado da verificação.

## Verificar a trilha de um banco qualquer

```bash
DATABASE_URL_SISTEMA=postgresql://pz_sistema:<senha>@127.0.0.1:5432/<banco> \
  pnpm --filter @pz/worker exec tsx src/auditoria/verificar-cadeia-cli.ts
```
