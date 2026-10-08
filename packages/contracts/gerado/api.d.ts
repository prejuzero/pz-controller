// Gerado por scripts/gerar.ts a partir de openapi.json. Não edite à mão.
export interface paths {
    "/v1/admin/calendario": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista os eventos do calendário global que cruzam o período (rascunhos inclusive). */
        get: operations["listarCalendarioGlobal"];
        put?: never;
        /** Propõe um evento global; só vale depois de aprovado por outro curador. */
        post: operations["proporEventoDoCalendario"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/calendario/{id}/aprovar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aprova um evento proposto por outro curador (quatro olhos). */
        post: operations["aprovarEventoDoCalendario"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/calendario/{id}/revogar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoga um evento aprovado, com motivo auditado. */
        post: operations["revogarEventoDoCalendario"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/calendario/importacao": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Valida um CSV (prévia) e, se tudo estiver certo, grava os eventos como rascunho. */
        post: operations["importarCalendario"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/filas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Contagem de jobs por fila do catálogo, com a DLQ. */
        get: operations["resumirFilas"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/filas/{fila}/dlq/{jobId}/reprocessar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Devolve um job da DLQ à fila de origem, com motivo auditado. */
        post: operations["reprocessarJobMorto"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/impersonacao": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Acessa um tenant por até 60 minutos, só para leitura, com motivo auditado. */
        post: operations["iniciarImpersonacao"];
        /** Encerra a impersonação em curso (sem efeito se não houver). */
        delete: operations["encerrarImpersonacao"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/integracoes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Estado de cada adaptador e o histórico recente de falhas. */
        get: operations["consultarIntegracoes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/rejeicoes-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista os e-mails que não recebem mais envios (bounce ou spam), por e-mail. */
        get: operations["listarRejeicoesDeEmail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/tabela-prazos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Versões da tabela (rascunhos e aprovadas), por ato e ramo. */
        get: operations["listarVersoesDaTabela"];
        put?: never;
        /** Propõe uma versão; só vale depois de aprovada por outro curador. */
        post: operations["proporVersaoDaTabela"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/tabela-prazos/{id}/aprovar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Aprova uma versão proposta por outro curador (quatro olhos). */
        post: operations["aprovarVersaoDaTabela"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/tabela-prazos/tipos-de-ato": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Taxonomia única de tipos de ato. */
        get: operations["listarTiposDeAto"];
        put?: never;
        /** Cadastra um tipo de ato na taxonomia. */
        post: operations["cadastrarTipoDeAto"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/tenants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista os tenants, do mais novo para o mais antigo. */
        get: operations["listarTenants"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/tenants/{tenantId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Detalha um tenant (plano, assinatura e suspensão). */
        get: operations["consultarTenant"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/tenants/{tenantId}/assinatura": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Altera o plano e a situação da assinatura (manual no MVP). */
        patch: operations["alterarAssinatura"];
        trace?: never;
    };
    "/v1/admin/tenants/{tenantId}/suspensao": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Suspende o acesso do tenant e derruba as sessões abertas (idempotente). */
        post: operations["suspenderTenant"];
        /** Reativa o acesso do tenant (sem efeito se não estiver suspenso). */
        delete: operations["reativarTenant"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/2fa/ativar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ativa o 2FA e devolve os códigos de recuperação. */
        post: operations["ativarSegundoFator"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/2fa/configurar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Gera o segredo TOTP e a URI do QR code. */
        post: operations["configurarSegundoFator"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/2fa/verificar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verifica o código do aplicativo ou de recuperação. */
        post: operations["verificarSegundoFator"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/acessos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Últimos acessos da conta (logins, 2FA, saídas e bloqueios). */
        get: operations["listarAcessos"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/dispositivos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Dispositivos com sessão na conta. */
        get: operations["listarDispositivos"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/dispositivos/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Encerra a sessão de um dispositivo na hora. */
        delete: operations["revogarDispositivo"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/entrar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Entra com e-mail e senha; a sessão nasce aguardando o 2FA. */
        post: operations["entrar"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/eu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Usuário, tenant e nível da sessão atual. */
        get: operations["consultarSessao"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/sair": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Encerra a sessão atual. */
        post: operations["sair"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/senha/esqueci": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Envia o link de redefinição de senha, se o e-mail tiver conta. */
        post: operations["solicitarRedefinicaoDeSenha"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/senha/redefinir": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Define a nova senha com o token recebido por e-mail. */
        post: operations["redefinirSenha"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/tokens": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registra o dispositivo e emite token de acesso curto e de renovação. */
        post: operations["emitirTokensDeDispositivo"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/tokens/renovar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Renova os tokens do dispositivo; o de renovação usado deixa de valer. */
        post: operations["renovarTokens"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/cadastro": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cadastra um advogado autônomo; depois ele entra e ativa o 2FA. */
        post: operations["cadastrarAdvogado"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/calendario/dias-nao-uteis": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Dias sem contagem na jurisdição e no período (até 3 anos), com motivo e fonte. */
        get: operations["consultarDiasNaoUteis"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/calendario/locais": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista os feriados e suspensões cadastrados pelo escritório. */
        get: operations["listarFeriadosLocais"];
        put?: never;
        /** Cadastra um feriado ou suspensão local, com o ato normativo (nunca nacional). */
        post: operations["cadastrarFeriadoLocal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/calendario/locais/{id}/revogar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoga um feriado local do escritório. */
        post: operations["revogarFeriadoLocal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/captura/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Situação da fonte e da captura de cada OAB do escritório. */
        get: operations["consultarStatusDaCaptura"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/clientes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista os clientes do escritório, do mais novo para o mais antigo. */
        get: operations["listarClientes"];
        put?: never;
        /** Cadastra um cliente. */
        post: operations["cadastrarCliente"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/clientes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Um cliente do escritório. */
        get: operations["consultarCliente"];
        put?: never;
        post?: never;
        /** Remove um cliente sem processos vinculados. */
        delete: operations["removerCliente"];
        options?: never;
        head?: never;
        /** Altera nome ou documento do cliente. */
        patch: operations["atualizarCliente"];
        trace?: never;
    };
    "/v1/email/verificar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirma o e-mail do usuário com o token do link (uso único, 24 h). */
        post: operations["verificarEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/notificacoes/avisos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** E-mails do usuário rejeitados e, para quem administra, colegas com rejeição recente. */
        get: operations["consultarAvisosDeEntrega"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/notificacoes/consentimentos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consentimentos ativos do usuário por canal (push, WhatsApp, SMS). */
        get: operations["listarConsentimentos"];
        put?: never;
        /** Registra o consentimento para receber avisos num canal e destino. */
        post: operations["concederConsentimento"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/notificacoes/consentimentos/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Revoga o consentimento de um canal. */
        delete: operations["revogarConsentimento"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/notificacoes/destino-push": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Registra ou atualiza o token de push do dispositivo da sessão. */
        put: operations["registrarDestinoPush"];
        post?: never;
        /** Desativa o push do dispositivo da sessão. */
        delete: operations["desativarDestinoPush"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/oabs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Adiciona uma OAB suplementar; ela entra no monitoramento. */
        post: operations["adicionarOab"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/oabs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Remove uma OAB suplementar do monitoramento (a principal não sai). */
        delete: operations["removerOab"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/perfil": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Perfil do advogado da sessão, com as OABs ativas. */
        get: operations["consultarPerfil"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Altera nome, celular ou e-mails em cópia. */
        patch: operations["atualizarPerfil"];
        trace?: never;
    };
    "/v1/privacidade/encerramento": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Situação do encerramento da conta do escritório. */
        get: operations["consultarEncerramento"];
        put?: never;
        /** Pede o encerramento da conta: após 30 dias, dados de negócio são apagados e provas pseudonimizadas. */
        post: operations["solicitarEncerramento"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/privacidade/encerramento/cancelar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancela o pedido de encerramento dentro da carência. */
        post: operations["cancelarEncerramento"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/privacidade/exportacoes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Pede a exportação dos dados (JSON e CSV), gerada em segundo plano. */
        post: operations["solicitarExportacao"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/privacidade/exportacoes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Situação do pedido de exportação e, quando pronto, os links dos arquivos. */
        get: operations["consultarExportacao"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/processos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista os processos monitorados, do mais novo para o mais antigo. */
        get: operations["listarProcessos"];
        put?: never;
        /** Cadastra um processo pelo número CNJ; o tribunal é deduzido do número. */
        post: operations["cadastrarProcesso"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/processos/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Um processo do escritório. */
        get: operations["consultarProcesso"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Altera órgão, comarca, cliente ou sigilo do processo. */
        patch: operations["atualizarProcesso"];
        trace?: never;
    };
    "/v1/processos/{id}/cobertura": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Marca a cobertura do processo (automática, parcial ou manual), com motivo. */
        put: operations["alterarCobertura"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/processos/{id}/dias-nao-uteis": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Dias sem contagem na jurisdição do processo (tribunal, UF e comarca), com as lacunas. */
        get: operations["consultarDiasNaoUteisDoProcesso"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/publicacoes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Publicações do escritório, da mais nova para a mais antiga. */
        get: operations["listarPublicacoes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/publicacoes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Detalhe da publicação com o teor integral. */
        get: operations["consultarPublicacao"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/publicacoes/{id}/lida": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registra a leitura (indício de conhecimento, não ciência). Idempotente. */
        post: operations["marcarPublicacaoLida"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/saude": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Situação da API, para clientes verificarem a conexão. */
        get: operations["consultarSituacao"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/termos/{id}/aceitar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registra o aceite (com IP e navegador) da versão vigente de um documento. */
        post: operations["aceitarDocumentoLegal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/termos/aceites": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Histórico de aceites do usuário (exportável). */
        get: operations["listarAceites"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/termos/pendentes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Documentos legais que o usuário precisa aceitar para continuar usando o sistema. */
        get: operations["listarTermosPendentes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/termos/vigentes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Versão vigente dos termos de uso, da política de privacidade e do aviso de cobertura. */
        get: operations["listarDocumentosVigentes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/{adaptador}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Recebe o webhook de um provedor (assinatura verificada pelo adaptador). */
        post: operations["receberWebhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AceitesDoUsuario: {
            itens: {
                /** Format: uuid */
                documentoId: string;
                /** @enum {string} */
                tipo: "termos" | "privacidade" | "cobertura";
                versao: string;
                /** Format: date-time */
                aceitoEm: string;
                ip: string;
                userAgent: string;
            }[];
        };
        AcessosRecentes: {
            itens: {
                /** @enum {string} */
                tipo: "login" | "segundo-fator" | "logout" | "bloqueio";
                sucesso: boolean;
                ip: string;
                userAgent: string;
                /** Format: date-time */
                ocorridoEm: string;
            }[];
        };
        AlteracaoDoCliente: {
            nome?: string;
            /** @description CPF ou CNPJ, com ou sem máscara. */
            documento?: string | null;
        };
        AlteracaoDoPerfil: {
            nome?: string;
            celular?: string;
            /** @description Recebem cópia das notificações. */
            emailsAdicionais?: string[];
        };
        AlteracaoDoProcesso: {
            orgao?: string | null;
            comarca?: string | null;
            sigiloso?: boolean;
            /** @description Nulo desvincula o cliente. */
            clienteId?: string | null;
        };
        AvisosDeEntrega: {
            /** @description E-mails do usuário que rejeitaram mensagens (bounce) ou marcaram spam: não recebem notificações até serem trocados ou liberados pelo suporte. */
            emailsRejeitados: string[];
            /** @description Usuários do escritório com notificação rejeitada nos últimos 7 dias; null para quem não administra a equipe (`usuarios:gerir`). */
            usuariosDaEquipeComRejeicao: number | null;
        };
        CadastroRealizado: {
            /** Format: uuid */
            usuarioId: string;
            perfil: components["schemas"]["PerfilDoAdvogado"];
        };
        ClienteDoTenant: {
            /** Format: uuid */
            id: string;
            nome: string;
            /** @description CPF ou CNPJ sem pontuação. */
            documento: string | null;
        };
        CodigoSegundoFator: {
            /** @description 6 dígitos do aplicativo ou um código de recuperação (XXXXX-XXXXX). */
            codigo: string;
        };
        ConfiguracaoSegundoFator: {
            /** @description URI otpauth:// para o QR code do aplicativo autenticador. */
            uri: string;
            /** @description O mesmo segredo, para digitar manualmente. */
            segredo: string;
        };
        ConsentimentoDoCanal: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            canal: "push" | "whatsapp" | "sms";
            destino: string;
            /** Format: date-time */
            concedidoEm: string;
            /** @enum {string} */
            origem: "portal" | "app" | "mcp" | "integrador";
        };
        ConsentimentosDoUsuario: {
            /** @description Só os ativos. */
            itens: components["schemas"]["ConsentimentoDoCanal"][];
        };
        Credenciais: {
            email: string;
            senha: string;
        };
        DestinoPushRegistrado: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            dispositivoId: string;
        };
        DiasNaoUteis: {
            itens: {
                /** Format: date */
                data: string;
                /** @enum {string} */
                tipo: "feriado" | "recesso" | "portaria" | "indisponibilidade";
                motivo: string;
                fonte: {
                    /** @enum {string} */
                    origem: "global" | "local";
                    /** Format: uuid */
                    eventoId: string;
                    atoNormativo: string;
                    urlAto: string;
                };
            }[];
        };
        DiasNaoUteisDoProcesso: {
            itens: {
                /** Format: date */
                data: string;
                /** @enum {string} */
                tipo: "feriado" | "recesso" | "portaria" | "indisponibilidade";
                motivo: string;
                fonte: {
                    /** @enum {string} */
                    origem: "global" | "local";
                    /** Format: uuid */
                    eventoId: string;
                    atoNormativo: string;
                    urlAto: string;
                };
            }[];
            /** @description Jurisdição resolvida a partir do processo. */
            jurisdicao: {
                /** @description Sigla da UF. */
                uf?: string;
                /** @description Código IBGE do município. */
                municipioIbge?: string;
                /** @description Sigla do tribunal (ex.: TJSP). */
                tribunal?: string;
                /** @description Comarca, dentro do tribunal. */
                comarca?: string;
            };
            /** @description Níveis que o processo não informa: feriados desses níveis não entram e a tela deve avisar. */
            lacunas: ("tribunal" | "uf" | "municipio" | "comarca")[];
        };
        DispositivosDaConta: {
            itens: {
                /** Format: uuid */
                id: string;
                /** @enum {string} */
                tipoCliente: "web" | "mobile" | "mcp" | "integrador";
                nome: string;
                /** Format: date-time */
                criadoEm: string;
                /** Format: date-time */
                ultimoUso: string;
                revogadaEm: string | null;
            }[];
        };
        DocumentosPendentes: {
            itens: {
                /** Format: uuid */
                id: string;
                /** @enum {string} */
                tipo: "termos" | "privacidade" | "cobertura";
                versao: string;
                conteudo: string;
                /** @description O que mudou em relação à versão anterior. */
                resumoAlteracoes: string | null;
                /** Format: date-time */
                publicadoEm: string;
            }[];
        };
        EncerramentoDaConta: {
            /**
             * @description Carência de 30 dias: até `efetivarEm` o responsável pode cancelar.
             * @enum {string}
             */
            situacao: "nenhum" | "em-carencia" | "vencido" | "cancelado" | "efetivado";
            solicitadoEm: string | null;
            efetivarEm: string | null;
        };
        EventoDoCalendario: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            abrangencia: "nacional" | "uf" | "municipio" | "tribunal" | "comarca";
            uf: string | null;
            municipioIbge: string | null;
            tribunal: string | null;
            comarca: string | null;
            /** @enum {string} */
            tipo: "feriado" | "recesso" | "portaria" | "indisponibilidade";
            /** Format: date */
            inicio: string;
            /** Format: date */
            fim: string;
            descricao: string;
            atoNormativo: string;
            urlAto: string;
            revogadoPor: string | null;
            revogadoEm: string | null;
            /**
             * @description Só aprovado e não revogado vale.
             * @enum {string}
             */
            status: "rascunho" | "aprovado";
            /** Format: uuid */
            propostoPor: string;
            /** Format: date-time */
            propostoEm: string;
            aprovadoPor: string | null;
            aprovadoEm: string | null;
            motivoRevogacao: string | null;
        };
        EventosDoCalendario: {
            itens: components["schemas"]["EventoDoCalendario"][];
        };
        ExportacaoDeDados: {
            /** Format: uuid */
            id: string;
            /**
             * @description `titular`: dados pessoais do usuário; `escritorio`: todo o tenant (responsável).
             * @enum {string}
             */
            escopo: "titular" | "escritorio";
            /** @enum {string} */
            situacao: "pendente" | "concluida";
            /** Format: date-time */
            solicitadaEm: string;
            concluidaEm: string | null;
            /** @description Os arquivos ficam disponíveis por 7 dias. */
            expiraEm: string | null;
            /** @description Links assinados (15 min) para JSON e CSV, quando concluída e dentro da validade. */
            arquivos: {
                nome: string;
                /** Format: uri */
                url: string;
            }[];
        };
        ExportacaoSolicitada: {
            /** Format: uuid */
            id: string;
            /** @description false: já havia pedido pendente do mesmo escopo. */
            nova: boolean;
        };
        FeriadoLocal: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            abrangencia: "nacional" | "uf" | "municipio" | "tribunal" | "comarca";
            uf: string | null;
            municipioIbge: string | null;
            tribunal: string | null;
            comarca: string | null;
            /** @enum {string} */
            tipo: "feriado" | "recesso" | "portaria" | "indisponibilidade";
            /** Format: date */
            inicio: string;
            /** Format: date */
            fim: string;
            descricao: string;
            atoNormativo: string;
            urlAto: string;
            revogadoPor: string | null;
            revogadoEm: string | null;
            /** Format: uuid */
            cadastradoPor: string;
            /** Format: date-time */
            cadastradoEm: string;
        };
        FeriadosLocais: {
            itens: components["schemas"]["FeriadoLocal"][];
        };
        OabDoAdvogado: {
            /** Format: uuid */
            id: string;
            numero: string;
            uf: string;
            /** @enum {string} */
            tipo: "principal" | "suplementar";
        };
        PaginaDeClientes: {
            itens: components["schemas"]["ClienteDoTenant"][];
            /** @description Nulo quando não há mais páginas. */
            proximoCursor: string | null;
        };
        PaginaDeProcessos: {
            itens: components["schemas"]["ProcessoDoTenant"][];
            /** @description Nulo quando não há mais páginas. */
            proximoCursor: string | null;
        };
        PaginaDePublicacoes: {
            itens: components["schemas"]["PublicacaoDoTenant"][];
            /** @description Nulo quando não há mais páginas. */
            proximoCursor: string | null;
        };
        PaginaDeRejeicoes: {
            itens: {
                email: string;
                /** @enum {string} */
                motivo: "bounce" | "spam";
                /** Format: date-time */
                criadaEm: string;
            }[];
            /** @description Nulo quando não há mais páginas. */
            proximoCursor: string | null;
        };
        PaginaDeTenants: {
            itens: components["schemas"]["TenantAdministrado"][];
            /** @description Nulo quando não há mais páginas. */
            proximoCursor: string | null;
        };
        PainelDeIntegracoes: {
            /** @description Só adaptadores de instâncias que informaram nos últimos 2 minutos. */
            adaptadores: {
                adaptador: string;
                /**
                 * @description Pior estado entre as instâncias do worker.
                 * @enum {string}
                 */
                estado: "operacional" | "degradado" | "indisponivel";
                instancias: number;
                ultimoSucesso: string | null;
                ultimaFalha: string | null;
                /** @description Mensagem da última falha, sem dados do processo. */
                erro: string | null;
            }[];
            /** @description Falhas mais recentes primeiro (até 50). */
            falhas: {
                adaptador: string;
                instancia: string;
                /** Format: date-time */
                em: string;
                erro: string;
            }[];
        };
        PedidoDeAssinatura: {
            plano?: string | null;
            /**
             * @description Situação da assinatura, manual no MVP (gateway de cobrança futuro).
             * @enum {string}
             */
            situacaoAssinatura?: "teste" | "ativa" | "inadimplente" | "cancelada";
        };
        PedidoDeCadastro: {
            nome: string;
            /** @description Com ou sem máscara. */
            cpf: string;
            /** Format: email */
            email: string;
            senha: string;
            /** @description Com DDD. */
            celular: string;
            oabPrincipal: components["schemas"]["PedidoDeOab"];
            oabsSuplementares?: components["schemas"]["PedidoDeOab"][];
            /** @description Recebem cópia das notificações. */
            emailsAdicionais?: string[];
        };
        PedidoDeCliente: {
            nome: string;
            /** @description CPF ou CNPJ, com ou sem máscara. */
            documento?: string | null;
        };
        PedidoDeCobertura: {
            /**
             * @description Automática: as fontes públicas trazem as intimações; parcial ou manual: conferir no painel do tribunal.
             * @enum {string}
             */
            cobertura: "automatica" | "parcial" | "manual";
            /** @description Obrigatório quando a cobertura não é automática. */
            motivo?: string | null;
        };
        /** @description O e-mail não entra: segue a base legal do serviço contratado. */
        PedidoDeConsentimento: {
            /** @constant */
            canal: "push";
            /**
             * Format: uuid
             * @description ID do dispositivo (app).
             */
            destino: string;
        } | {
            /** @constant */
            canal: "whatsapp";
            /** @description Telefone E.164 (+5511...). */
            destino: string;
        } | {
            /** @constant */
            canal: "sms";
            /** @description Telefone E.164 (+5511...). */
            destino: string;
        };
        PedidoDeDestinoPush: {
            /** @enum {string} */
            plataforma: "ios" | "android" | "web";
            /** @description Token de push do sistema do aparelho. */
            token: string;
        };
        PedidoDeEventoDoCalendario: {
            /**
             * @description Os campos de jurisdição exigidos dependem dela.
             * @enum {string}
             */
            abrangencia: "nacional" | "uf" | "municipio" | "tribunal" | "comarca";
            /** @description Sigla da UF. */
            uf?: string;
            /** @description Código IBGE do município. */
            municipioIbge?: string;
            /** @description Sigla do tribunal (ex.: TJSP). */
            tribunal?: string;
            /** @description Comarca, dentro do tribunal. */
            comarca?: string;
            /** @enum {string} */
            tipo: "feriado" | "recesso" | "portaria" | "indisponibilidade";
            /** Format: date */
            inicio: string;
            /**
             * Format: date
             * @description Inclusivo; igual ao início para um só dia.
             */
            fim: string;
            descricao: string;
            /** @description Lei, resolução ou portaria, com artigo. */
            atoNormativo: string;
            /**
             * Format: uri
             * @description Link HTTPS da fonte oficial.
             */
            urlAto: string;
        };
        PedidoDeExportacao: {
            /**
             * @description `titular`: dados pessoais do usuário; `escritorio`: todo o tenant (responsável).
             * @enum {string}
             */
            escopo: "titular" | "escritorio";
        };
        PedidoDeImpersonacao: {
            /**
             * Format: uuid
             * @description Tenant a acessar (nunca o da plataforma).
             */
            tenantId: string;
            /** @description Por que o acesso é necessário (ex.: número do chamado); vai para a auditoria. */
            motivo: string;
        };
        PedidoDeImportacaoDoCalendario: {
            /** @description CSV (separador ; ou ,) com o cabeçalho abrangencia;uf;municipioIbge;tribunal;comarca;tipo;inicio;fim;descricao;atoNormativo;urlAto. */
            csv: string;
            /**
             * @description true: só valida; false: grava se tudo for válido.
             * @default true
             */
            somentePrevia: boolean;
        };
        PedidoDeOab: {
            /** @description Número de inscrição (ex.: 123456 ou 12345A). */
            numero: string;
            /** @description Seccional (UF). */
            uf: string;
        };
        PedidoDeProcesso: {
            /** @description Com ou sem pontuação; dígito verificado. */
            numeroCnj: string;
            orgao?: string | null;
            comarca?: string | null;
            sigiloso?: boolean;
            /**
             * @description Automática: as fontes públicas trazem as intimações; parcial ou manual: conferir no painel do tribunal.
             * @enum {string}
             */
            cobertura?: "automatica" | "parcial" | "manual";
            /** @description Obrigatório quando a cobertura não é automática. */
            motivoCobertura?: string | null;
            clienteId?: string | null;
        };
        PedidoDeRedefinicaoDeSenha: {
            email: string;
        };
        PedidoDeRenovacao: {
            tokenDeRenovacao: string;
        };
        PedidoDeReprocessamento: {
            /** @description Por que o job pode voltar à fila (ex.: causa corrigida); vai para a auditoria. */
            motivo: string;
        };
        PedidoDeRevogacaoDoEvento: {
            /** @description Vai para a auditoria. */
            motivo: string;
        };
        PedidoDeSuspensao: {
            /** @description Por que o acesso é suspenso (ex.: número do chamado); vai para a auditoria. */
            motivo: string;
        };
        PedidoDeTipoDeAto: {
            /** @description Código da taxonomia única (kebab-case). */
            codigo: string;
            nome: string;
            descricao: string;
            sinonimos?: string[];
        };
        PedidoDeTokensDeDispositivo: {
            /** @enum {string} */
            tipoCliente: "web" | "mobile" | "mcp" | "integrador";
            nomeDispositivo: string;
        };
        PedidoDeVerificacaoDeEmail: {
            /** @description Token do link enviado por e-mail. */
            token: string;
        };
        PedidoDeVersaoDaTabela: {
            /** @description Código da taxonomia única (kebab-case). */
            tipoAto: string;
            /** @enum {string} */
            ramo: "civel" | "juizados" | "trabalhista" | "penal";
            /** @description Quantidade, na unidade indicada. */
            dias: number;
            /**
             * @description Fora de dias, só há cálculo com regra específica cadastrada.
             * @enum {string}
             */
            unidade: "dias" | "horas" | "meses" | "anos";
            /** @description Dispositivo legal (lei, artigo, parágrafo). */
            fundamento: string;
            /**
             * Format: uri
             * @description Link HTTPS da fonte oficial.
             */
            fonteUrl: string;
            /** Format: date */
            vigenciaInicio: string;
            /** Format: date */
            vigenciaFim?: string;
        };
        PerfilDoAdvogado: {
            /** Format: uuid */
            id: string;
            nome: string;
            /** @description Mascarado (***.123.456-**). */
            cpf: string;
            /** @description Só dígitos, com DDD. */
            celular: string;
            emailsAdicionais: string[];
            /** @description Só as ativas. */
            oabs: components["schemas"]["OabDoAdvogado"][];
        };
        Problema: {
            /** @description URI que identifica o tipo do problema. */
            type: string;
            /** @description Resumo legível, em pt-BR. */
            title: string;
            status: number;
            detail?: string;
            instance?: string;
            /** @description Código estável do erro (ex.: prazo.ja-confirmado). */
            codigo: string;
            /** @description Problemas por campo, nos erros de validação. */
            problemas?: {
                campo: string;
                mensagem: string;
            }[];
            requestId?: string;
        };
        ProcessoDoTenant: {
            /** Format: uuid */
            id: string;
            /** @description Com a máscara do CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO). */
            numeroCnj: string;
            /** @description Sigla deduzida do número; nula se desconhecida. */
            tribunal: string | null;
            /** @description Ramo da Justiça deduzido do tribunal. */
            ramo: string | null;
            orgao: string | null;
            comarca: string | null;
            sigiloso: boolean;
            /**
             * @description Automática: as fontes públicas trazem as intimações; parcial ou manual: conferir no painel do tribunal.
             * @enum {string}
             */
            cobertura: "automatica" | "parcial" | "manual";
            motivoCobertura: string | null;
            clienteId: string | null;
        };
        PublicacaoDoTenant: {
            /** Format: uuid */
            id: string;
            /** @description Adaptador de origem (ex.: djen). */
            fonte: string;
            idExterno: string;
            /** @description 20 dígitos, quando a fonte informa. */
            numeroCnj: string | null;
            /** Format: date */
            dataDisponibilizacao: string;
            /** @description Teor integral, normalizado. */
            teor: string;
            /** @description Certidão pública na fonte (não abre o expediente no tribunal). */
            urlFonte: string;
            processoId: string | null;
            siglaTribunal: string | null;
            tipoComunicacao: string | null;
            /** Format: date-time */
            recebidaEm: string;
            /**
             * Format: date-time
             * @description Instante da captura, gravado pelo banco (prova).
             */
            capturadoEm: string;
            /** @description Primeira leitura no escritório: indício, não ciência. */
            lidaEm: string | null;
        };
        RedefinicaoDeSenha: {
            /** @description Token do link enviado por e-mail. */
            token: string;
            novaSenha: string;
        };
        ResultadoDaImportacao: {
            linhas: {
                linha: number;
                problemas: {
                    campo: string;
                    mensagem: string;
                }[];
            }[];
            /** @description Rascunhos gravados (vazio na prévia). */
            propostos: components["schemas"]["EventoDoCalendario"][];
        };
        ResumoDasFilas: {
            filas: {
                fila: string;
                aguardando: number;
                ativos: number;
                atrasados: number;
                falhos: number;
                /** @description Jobs na DLQ da fila. */
                mortos: number;
            }[];
        };
        SegundoFatorAtivado: {
            sessao: components["schemas"]["SessaoAtual"];
            /** @description Exibidos só agora: cada um vale uma vez se o celular for perdido. */
            codigosDeRecuperacao: string[];
        };
        SessaoAtual: {
            /** Format: uuid */
            usuarioId: string;
            /** Format: uuid */
            tenantId: string;
            /**
             * @description `senha`: falta o 2FA; `completo`: senha e 2FA verificados.
             * @enum {string}
             */
            nivel: "senha" | "completo";
            /** @description O que falta antes de usar o sistema; null quando nada. `aceitar-termos`: versão nova de documento legal (GET /v1/termos/pendentes). */
            proximoPasso: ("configurar-2fa" | "verificar-2fa" | "aceitar-termos") | null;
            /** @description Permissões efetivas (catálogo da HU07, ex.: `prazos:ler`), também usadas como escopos OAuth. Vazio sem o 2FA. O portal só oculta ações; a API sempre confere. */
            permissoes: string[];
            /** @description Impersonação em curso (HU07): o portal mostra a faixa enquanto houver. Ausente ou null fora dela. */
            impersonacao?: {
                /**
                 * Format: uuid
                 * @description Tenant acessado; as requisições rodam nele, só para leitura.
                 */
                tenantId: string;
                motivo: string;
                /** Format: date-time */
                expiraEm: string;
            } | null;
        };
        SituacaoDaApi: {
            /** @enum {string} */
            situacao: "operacional" | "degradada";
            /** @description Versão implantada (SHA do commit). */
            versao: string;
            /** Format: date-time */
            verificadoEm: string;
        };
        StatusDaCaptura: {
            fonte: {
                /** @description Fonte de publicações (ex.: djen). */
                id: string;
                /** @enum {string} */
                situacao: "operacional" | "degradada";
                /** @description Desde quando está na situação atual. */
                desde: string | null;
            };
            oabs: {
                /** Format: uuid */
                oabId: string;
                /** @description Número/UF, ex.: 123456/SP. */
                oab: string;
                /** @description Última captura bem-sucedida. */
                ultimoSucesso: string | null;
                /** @description Próxima tentativa após falha; nulo: na próxima rodada do agendamento. */
                proximaExecucao: string | null;
                falhasConsecutivas: number;
            }[];
        };
        TenantAdministrado: {
            /** Format: uuid */
            id: string;
            nome: string;
            /** @enum {string} */
            tipo: "autonomo" | "escritorio" | "plataforma";
            plano: string | null;
            /**
             * @description Situação da assinatura, manual no MVP (gateway de cobrança futuro).
             * @enum {string}
             */
            situacaoAssinatura: "teste" | "ativa" | "inadimplente" | "cancelada";
            /** @description Acesso suspenso: login e renovação recusados; captura e avisos continuam. */
            suspensao: {
                /** Format: date-time */
                em: string;
                motivo: string;
            } | null;
            encerradoEm: string | null;
            /** Format: date-time */
            criadoEm: string;
        };
        TipoDeAto: {
            /** @description Código da taxonomia única (kebab-case). */
            codigo: string;
            nome: string;
            descricao: string;
            sinonimos: string[];
        };
        TiposDeAto: {
            itens: components["schemas"]["TipoDeAto"][];
        };
        TokensDeDispositivo: {
            /** Format: uuid */
            dispositivoId: string;
            /** @description Bearer de 15 min. */
            tokenDeAcesso: string;
            /** Format: date-time */
            acessoExpiraEm: string;
            /** @description Uso único; reutilizar revoga o dispositivo. */
            tokenDeRenovacao: string;
            /** Format: date-time */
            renovacaoExpiraEm: string;
        };
        VersaoDaTabela: {
            /** Format: uuid */
            id: string;
            /** @description Código da taxonomia única (kebab-case). */
            tipoAto: string;
            /** @enum {string} */
            ramo: "civel" | "juizados" | "trabalhista" | "penal";
            versao: number;
            dias: number;
            /**
             * @description Fora de dias, só há cálculo com regra específica cadastrada.
             * @enum {string}
             */
            unidade: "dias" | "horas" | "meses" | "anos";
            fundamento: string;
            fonteUrl: string;
            /** Format: date */
            vigenciaInicio: string;
            vigenciaFim: string | null;
            /**
             * @description Só a aprovada entra no cálculo.
             * @enum {string}
             */
            status: "rascunho" | "aprovado";
            /** Format: uuid */
            propostoPor: string;
            /** Format: date-time */
            propostoEm: string;
            aprovadoPor: string | null;
            aprovadoEm: string | null;
        };
        VersoesDaTabela: {
            itens: components["schemas"]["VersaoDaTabela"][];
        };
        WebhookAceito: {
            /** @description O mesmo webhook (ID externo) já tinha sido recebido. */
            duplicado: boolean;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listarCalendarioGlobal: {
        parameters: {
            query?: {
                inicio?: string;
                fim?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventosDoCalendario"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    proporEventoDoCalendario: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeEventoDoCalendario"];
            };
        };
        responses: {
            /** @description Sucesso. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventoDoCalendario"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    aprovarEventoDoCalendario: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventoDoCalendario"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    revogarEventoDoCalendario: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeRevogacaoDoEvento"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventoDoCalendario"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    importarCalendario: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeImportacaoDoCalendario"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResultadoDaImportacao"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    resumirFilas: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResumoDasFilas"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    reprocessarJobMorto: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fila: string;
                jobId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeReprocessamento"];
            };
        };
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    iniciarImpersonacao: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeImpersonacao"];
            };
        };
        responses: {
            /** @description Sucesso. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessaoAtual"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    encerrarImpersonacao: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarIntegracoes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PainelDeIntegracoes"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarRejeicoesDeEmail: {
        parameters: {
            query?: {
                /** @description Cursor devolvido na página anterior. */
                cursor?: string;
                /** @description Quantidade de itens por página. */
                limite?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaginaDeRejeicoes"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarVersoesDaTabela: {
        parameters: {
            query?: {
                /** @description Código da taxonomia única (kebab-case). */
                tipoAto?: string;
                ramo?: "civel" | "juizados" | "trabalhista" | "penal";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VersoesDaTabela"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    proporVersaoDaTabela: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeVersaoDaTabela"];
            };
        };
        responses: {
            /** @description Sucesso. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VersaoDaTabela"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    aprovarVersaoDaTabela: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VersaoDaTabela"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarTiposDeAto: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TiposDeAto"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    cadastrarTipoDeAto: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeTipoDeAto"];
            };
        };
        responses: {
            /** @description Sucesso. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TipoDeAto"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarTenants: {
        parameters: {
            query?: {
                /** @description Cursor devolvido na página anterior. */
                cursor?: string;
                /** @description Quantidade de itens por página. */
                limite?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaginaDeTenants"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarTenant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantAdministrado"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    alterarAssinatura: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeAssinatura"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantAdministrado"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    suspenderTenant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeSuspensao"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantAdministrado"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    reativarTenant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantAdministrado"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    ativarSegundoFator: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CodigoSegundoFator"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SegundoFatorAtivado"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    configurarSegundoFator: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfiguracaoSegundoFator"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    verificarSegundoFator: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CodigoSegundoFator"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessaoAtual"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarAcessos: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcessosRecentes"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarDispositivos: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DispositivosDaConta"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    revogarDispositivo: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    entrar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Credenciais"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessaoAtual"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Limite de requisições excedido. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarSessao: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessaoAtual"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    sair: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    solicitarRedefinicaoDeSenha: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeRedefinicaoDeSenha"];
            };
        };
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Limite de requisições excedido. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    redefinirSenha: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RedefinicaoDeSenha"];
            };
        };
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Limite de requisições excedido. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    emitirTokensDeDispositivo: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeTokensDeDispositivo"];
            };
        };
        responses: {
            /** @description Sucesso. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TokensDeDispositivo"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    renovarTokens: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeRenovacao"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TokensDeDispositivo"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Limite de requisições excedido. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    cadastrarAdvogado: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeCadastro"];
            };
        };
        responses: {
            /** @description Sucesso. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CadastroRealizado"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Limite de requisições excedido. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarDiasNaoUteis: {
        parameters: {
            query: {
                /** @description Sigla da UF. */
                uf?: string;
                /** @description Código IBGE do município. */
                municipioIbge?: string;
                /** @description Sigla do tribunal (ex.: TJSP). */
                tribunal?: string;
                /** @description Comarca, dentro do tribunal. */
                comarca?: string;
                inicio: string;
                fim: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiasNaoUteis"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarFeriadosLocais: {
        parameters: {
            query?: {
                inicio?: string;
                fim?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeriadosLocais"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    cadastrarFeriadoLocal: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeEventoDoCalendario"];
            };
        };
        responses: {
            /** @description Sucesso. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeriadoLocal"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    revogarFeriadoLocal: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeriadoLocal"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarStatusDaCaptura: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StatusDaCaptura"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarClientes: {
        parameters: {
            query?: {
                /** @description Cursor devolvido na página anterior. */
                cursor?: string;
                /** @description Quantidade de itens por página. */
                limite?: number;
                /** @description Parte do nome. */
                nome?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaginaDeClientes"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    cadastrarCliente: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeCliente"];
            };
        };
        responses: {
            /** @description Sucesso. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClienteDoTenant"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarCliente: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClienteDoTenant"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    removerCliente: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Regra de negócio violada. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    atualizarCliente: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AlteracaoDoCliente"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClienteDoTenant"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    verificarEmail: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeVerificacaoDeEmail"];
            };
        };
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Limite de requisições excedido. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarAvisosDeEntrega: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AvisosDeEntrega"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarConsentimentos: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsentimentosDoUsuario"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    concederConsentimento: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeConsentimento"];
            };
        };
        responses: {
            /** @description Sucesso. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsentimentoDoCanal"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    revogarConsentimento: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    registrarDestinoPush: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeDestinoPush"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DestinoPushRegistrado"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    desativarDestinoPush: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    adicionarOab: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeOab"];
            };
        };
        responses: {
            /** @description Sucesso. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OabDoAdvogado"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Regra de negócio violada. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    removerOab: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Regra de negócio violada. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarPerfil: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PerfilDoAdvogado"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    atualizarPerfil: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AlteracaoDoPerfil"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PerfilDoAdvogado"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarEncerramento: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EncerramentoDaConta"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    solicitarEncerramento: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EncerramentoDaConta"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    cancelarEncerramento: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    solicitarExportacao: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeExportacao"];
            };
        };
        responses: {
            /** @description Sucesso. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExportacaoSolicitada"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarExportacao: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExportacaoDeDados"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarProcessos: {
        parameters: {
            query?: {
                /** @description Cursor devolvido na página anterior. */
                cursor?: string;
                /** @description Quantidade de itens por página. */
                limite?: number;
                /** @description Número CNJ completo ou parcial. */
                numero?: string;
                clienteId?: string;
                /** @description Sigla (ex.: TJSP). */
                tribunal?: string;
                /** @description Automática: as fontes públicas trazem as intimações; parcial ou manual: conferir no painel do tribunal. */
                cobertura?: "automatica" | "parcial" | "manual";
                sigiloso?: "true" | "false";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaginaDeProcessos"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    cadastrarProcesso: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeProcesso"];
            };
        };
        responses: {
            /** @description Sucesso. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProcessoDoTenant"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Conflito com o estado atual. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Regra de negócio violada. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarProcesso: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProcessoDoTenant"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    atualizarProcesso: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AlteracaoDoProcesso"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProcessoDoTenant"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    alterarCobertura: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PedidoDeCobertura"];
            };
        };
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProcessoDoTenant"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Regra de negócio violada. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarDiasNaoUteisDoProcesso: {
        parameters: {
            query: {
                inicio: string;
                fim: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiasNaoUteisDoProcesso"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarPublicacoes: {
        parameters: {
            query?: {
                /** @description Cursor devolvido na página anterior. */
                cursor?: string;
                /** @description Quantidade de itens por página. */
                limite?: number;
                /** @description true: só as não lidas. */
                novas?: "true" | "false";
                /** @description Disponibilização a partir de. */
                de?: string;
                /** @description Disponibilização até. */
                ate?: string;
                processoId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaginaDePublicacoes"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarPublicacao: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicacaoDoTenant"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    marcarPublicacaoLida: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    consultarSituacao: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SituacaoDaApi"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    aceitarDocumentoLegal: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso, sem corpo. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarAceites: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AceitesDoUsuario"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarTermosPendentes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentosPendentes"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Sem permissão. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    listarDocumentosVigentes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DocumentosPendentes"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
    receberWebhook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                adaptador: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sucesso. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookAceito"];
                };
            };
            /** @description Entrada inválida. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não autenticado. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Não encontrado. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
            /** @description Erro inesperado. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problema"];
                };
            };
        };
    };
}
