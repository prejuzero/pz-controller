# Módulo privacidade

Direitos do titular (HU38, LGPD art. 18).

## Exportação de dados

- Escopos (decisão de 07/10/2026): `titular` (qualquer usuário, os próprios dados pessoais) e `escritorio` (todo o tenant; permissão `escritorio:exportar`, perfis `advogado` e `admin_escritorio`).
- `POST /v1/privacidade/exportacoes` grava o pedido (`exportacao_dados`, RLS), a trilha (`privacidade.exportacao-solicitada`) e o evento `ExportacaoDeDadosSolicitada` na mesma transação; pedido pendente do mesmo escopo é devolvido, não repetido.
- O worker (`GerarExportacao`) junta as seções das fontes de cada módulo (`FonteDeExportacao`: identidade, cadastro, termos e notificações, cada uma só sobre as próprias tabelas), grava `dados.json` e `dados.csv` em `privacidade/exportacoes/{id}/` no bucket `ARQUIVOS_BUCKET` e marca concluída. Segredos (hash de senha, TOTP, códigos de recuperação, tokens) nunca entram.
- `GET /v1/privacidade/exportacoes/{id}`: só o solicitante; arquivos por 7 dias, links assinados de 15 minutos.

## Encerramento da conta

- Decisões de 07/10/2026: carência de 30 dias; na efetivação, dados de negócio apagados e provas pseudonimizadas e mantidas até o fim da retenção.
- `POST /v1/privacidade/encerramento` (permissão `escritorio:encerrar`), `POST .../cancelar` (só na carência) e `GET .../encerramento`, com trilha.
- Job diário `privacidade.efetivar-encerramentos` (worker, papel sistema): encerra as sessões, remove os arquivos exportados e, numa transação, registra `privacidade.conta-encerrada` na trilha do tenant e chama `pz_efetivar_encerramento` (função `SECURITY DEFINER`, só para o papel sistema, recusa pedido não vencido).
- Apagados: alvos assinados, processos, clientes, OABs, advogados, preferências, destinos push, dispositivos, perfis, exportações e outbox. Pseudonimizados: acessos, aceites, notificações (destinatários e dados), consentimentos, dados pessoais da trilha (ADR-018) e a conta do usuário. Mantidos: trilha de auditoria e feriados locais (sem dado pessoal). Tenant marcado com `encerrado_em`.

## Próximo passo (PZ-224)

- Job de retenção: acessos após 1 ano; provas pseudonimizadas de tenants encerrados após 5 anos (prazos a confirmar com o jurídico).
