# Piloto local: o PrejuZero em uma máquina do escritório

Para os advogados usarem o sistema de verdade, sem nuvem e sem custo, numa máquina da rede do escritório.

## 1. Configurar (`.env` na raiz)

```
CHAVE_CIFRAGEM=<openssl rand -base64 32>       # guarde: sem ela os dados cifrados não abrem
PILOTO_HOST=prejuzero.local                     # nome ou IP da máquina na rede
PORTAL_URL=https://prejuzero.local              # o mesmo endereço (links dos e-mails)
# E-mail real por uma conta que o escritório já tem (ex.: Google Workspace ou Outlook):
SMTP_HOST=smtp.gmail.com
SMTP_PORTA_APPS=587
SMTP_EXIGIR_TLS=true
SMTP_USUARIO=avisos@escritorio.com.br
SMTP_SENHA=<senha de app da conta>
EMAIL_REMETENTE=PrejuZero <avisos@escritorio.com.br>
```

Sem as variáveis de SMTP, os e-mails ficam só no Mailpit (`http://localhost:8025`) e não chegam a ninguém.

## 2. Subir

```
pnpm piloto:up
```

Sobe banco, filas, API, worker (captura do DJEN, lembretes e e-mails), portal e o proxy HTTPS na porta 443. **Não rode `pnpm db:seed`**: as contas de demonstração têm senha conhecida. Cada advogado se cadastra em `https://<PILOTO_HOST>/cadastro`.

## 3. Certificado nos computadores dos advogados

O proxy usa uma CA local. Exporte-a e instale como confiável em cada computador (uma vez):

```
infra/docker/compose.sh --profile apps --profile piloto cp proxy:/data/caddy/pki/authorities/local/root.crt ./prejuzero-ca.crt
```

macOS: abra o arquivo no Acesso às Chaves e marque "Sempre confiar". Windows: instale em "Autoridades de Certificação Raiz Confiáveis".

## 4. Backup diário

`pnpm backup` grava banco e arquivos em `./backups` (mantém os 7 mais recentes). Agende no `cron` (ou no Agendador de Tarefas) e copie a pasta para outro disco. Restaurar: `infra/backup/restaurar.sh`.

## Limites do piloto

- O cálculo automático só existe para atos com regra aprovada pela curadoria; os demais ficam "a confirmar" sem data, e o advogado informa o vencimento.
- Feriados estaduais e municipais da comarca dependem do cadastro da curadoria: confira as datas sugeridas.
- A máquina precisa ficar ligada para a captura (6 vezes ao dia) e os lembretes.
