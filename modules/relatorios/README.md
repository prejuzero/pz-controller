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

## Agenda pessoal .ics (HU50, RF55; decisões do usuário em 09/11/2026)

- **Conteúdo:** prazos abertos (pendentes e a confirmar) com vencimento, do usuário e os sem responsável. Cada um é um evento de dia inteiro no vencimento (a data é a do motor; nenhuma é calculada aqui), com o mínimo: "Prazo: <ato> (a confirmar) · <número do processo>", o aviso de que a data só vale depois de confirmada e o link do portal. Processo sigiloso vira só "Prazo (processo sigiloso)". Nada de partes, teor ou cliente (a agenda fica em servidor de terceiros).
- **Download:** `GET /v1/agenda/prazos.ics` (`prazos:ler`).
- **Feed privado:** `POST /v1/agenda/assinatura` cria o endereço (`https://…/v1/agenda/feed/{token}` e `webcal://…`), mostrado uma vez; criar de novo revoga o anterior; `DELETE` revoga. No banco só o hash do token (`feed_agenda`, RLS); a leitura sem sessão usa a função restrita `pz_localizar_feed_agenda` (escritório suspenso ou usuário desativado não leem). Criação e revogação ficam na trilha; cada leitura só atualiza o último acesso.
- **Token na URL:** as agendas não mandam cabeçalho, então a rota do feed fica fora dos traces (`credencialNaUrl`, observability) e os logs usam só o padrão da rota.
- Google e Microsoft direto (OAuth nos provedores): "Externo · adiado".
