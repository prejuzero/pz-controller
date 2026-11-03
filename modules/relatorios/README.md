# Módulo relatorios (HU29)

Relatórios e exportação: a **agenda de prazos** de um período e o **resultado de qualquer busca**
(HU28), em PDF ou Excel, gerados em segundo plano.

- `SolicitarRelatorio` (API, `POST /v1/relatorios`): valida o pedido pelo contrato, grava o pedido,
  a trilha (`relatorios.exportacao-solicitada`, RF62) e o evento `RelatorioSolicitado` na mesma
  transação.
- `GerarRelatorio` (worker, fila `relatorios`): percorre a busca com os mesmos filtros e a mesma
  ordem da tela (até 5.000 linhas), monta o `Documento`, renderiza, grava no armazenamento e conclui
  com a trilha (`relatorios.exportacao-gerada`). Filtro recusado pela busca marca `falhou`.
- `ConsultarRelatorios` (API, `GET /v1/relatorios[/{id}]`): só o próprio usuário; o arquivo vale 24 h e
  cada link assinado vale até 15 min (limite do armazenamento).

Renderizadores plugáveis (`Renderizador`): `RenderizadorPdf` (pdfkit, A4 paisagem, cabeçalho com
data, hora, usuário e filtro, rodapé com página) e `RenderizadorXlsx` (ExcelJS). CSV e .ics entram
como novos renderizadores (F2).

O módulo não calcula datas: vencimento, início e fundamento vêm do prazo gravado pelo motor.
