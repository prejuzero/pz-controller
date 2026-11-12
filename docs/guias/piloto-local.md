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

## 3. Curadoria: conta e planilha

A tabela de prazos e o calendário forense vêm da planilha da curadora (`docs/curadoria/carga`). Sem eles aprovados, toda intimação capturada fica "a confirmar".

```
pnpm piloto:curadora --email <e-mail da curadora> --nome "<nome completo>"
pnpm piloto:carga --email <e-mail da curadora>
```

1. O primeiro comando cria a conta de curadora (sem senha). Ela abre `https://<PILOTO_HOST>/entrar`, clica em "Esqueci minha senha", define a senha pelo e-mail e ativa o 2FA. O e-mail precisa ser diferente do que ela usar como advogada de escritório.
2. O segundo carrega a planilha como **rascunhos** propostos por ela: 83 regras de prazo e 3.327 eventos do calendário (feriados nacionais, de tribunal, estaduais e municipais). Rodar de novo não duplica nada: só entra o que ainda não está cadastrado.
3. Ela entra, confere e clica em **"Aprovar todos os rascunhos"** em Prazos e em Calendário (o calendário é por ano: aprove em cada ano). A partir daí, o cálculo usa as regras dela. Cada aprovação fica na trilha de auditoria com o nome dela.

## 4. Certificado nos computadores dos advogados

O proxy usa uma CA local. Exporte-a e instale como confiável em cada computador (uma vez):

```
infra/docker/compose.sh --profile apps --profile piloto cp proxy:/data/caddy/pki/authorities/local/root.crt ./prejuzero-ca.crt
```

macOS: abra o arquivo no Acesso às Chaves e marque "Sempre confiar". Windows: instale em "Autoridades de Certificação Raiz Confiáveis".

## 5. Backup diário

`pnpm backup` grava banco e arquivos em `./backups` (mantém os 7 mais recentes). Agende no `cron` (ou no Agendador de Tarefas) e copie a pasta para outro disco. Restaurar: `infra/backup/restaurar.sh`.

## Limites do piloto

- O cálculo automático só existe para atos com regra aprovada pela curadoria; os demais ficam "a confirmar" sem data, e o advogado informa o vencimento.
- O feriado municipal entra quando a comarca do processo está no cadastro territorial da curadoria (escreva o nome do município, ex.: "Santa Rosa"); senão, o prazo avisa "Feriado local não verificado".
- A máquina precisa ficar ligada para a captura (6 vezes ao dia) e os lembretes.
