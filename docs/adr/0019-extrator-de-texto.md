# ADR-019 · Extração de texto de documentos atrás da porta ExtratorDeTexto

- **Status:** Proposto (aguarda aprovação humana)
- **Data:** 2026-10-31

## Contexto

O cadastro assistido (HU25, PZ-173) recebe o PDF da intimação e precisa do texto para o mesmo pipeline da classificação (regras rápidas e IA, ADR-008). Hoje a extração é local (camada de texto do PDF); documento escaneado vai exigir OCR, que pode ser um serviço externo.

## Decisão

- Porta `ExtratorDeTexto` em `packages/integracoes` (`extrairDePdf(bytes) → { texto, paginas }`). PDF inválido, corrompido ou protegido lança `ErroPermanente` (sem nova tentativa).
- Adaptador `@pz/adapter-pdf` com a biblioteca **unpdf** (MIT, mantida pelo UnJS, distribuição do pdf.js para servidor, sem binários nativos nem rede). Alternativas: `pdf-parse` (manutenção irregular, pdf.js antigo) e `pdfjs-dist` direto (mais configuração no Node).
- Sem camada de texto (escaneado), devolve texto vazio e a aplicação orienta o cadastro manual. OCR entra como outro adaptador da mesma porta, com ADR próprio se for serviço externo.
- Por ser local e sem rede, o adaptador não passa pelo registro de resiliência (timeout, circuito) do ADR-005; um OCR externo passará.

## Consequências

O PDF fica no armazenamento do tenant (ADR-017) e é vinculado ao prazo pelo caminho, com download só por URL assinada curta. Dependência nova: `unpdf` (≈3 MB desempacotado), presa à versão e sujeita à idade mínima de publicação do pnpm.
