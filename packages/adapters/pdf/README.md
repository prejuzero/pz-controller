# @pz/adapter-pdf

Adaptador da porta `ExtratorDeTexto` (ADR-019): lê a camada de texto de PDFs com **unpdf**, localmente e sem rede. PDF escaneado devolve texto vazio (quem chama orienta o cadastro manual); PDF inválido ou corrompido lança `ErroPermanente`. OCR será outro adaptador da mesma porta.
