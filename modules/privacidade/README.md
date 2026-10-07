# Módulo privacidade

Direitos do titular (HU38, LGPD art. 18).

## Exportação de dados

- Escopos (decisão de 07/10/2026): `titular` (qualquer usuário, os próprios dados pessoais) e `escritorio` (todo o tenant; permissão `escritorio:exportar`, perfis `advogado` e `admin_escritorio`).
- `POST /v1/privacidade/exportacoes` grava o pedido (`exportacao_dados`, RLS), a trilha (`privacidade.exportacao-solicitada`) e o evento `ExportacaoDeDadosSolicitada` na mesma transação; pedido pendente do mesmo escopo é devolvido, não repetido.
- O worker (`GerarExportacao`) junta as seções das fontes de cada módulo (`FonteDeExportacao`: identidade, cadastro, termos e notificações, cada uma só sobre as próprias tabelas), grava `dados.json` e `dados.csv` em `privacidade/exportacoes/{id}/` no bucket `ARQUIVOS_BUCKET` e marca concluída. Segredos (hash de senha, TOTP, códigos de recuperação, tokens) nunca entram.
- `GET /v1/privacidade/exportacoes/{id}`: só o solicitante; arquivos por 7 dias, links assinados de 15 minutos.

## Próximos passos (PZ-224)

- ADR: dados pessoais da trilha de auditoria fora do hash, pseudonimizáveis sem quebrar a cadeia.
- Encerramento de conta com carência de 30 dias, exclusão dos dados de negócio e política de retenção por job.
