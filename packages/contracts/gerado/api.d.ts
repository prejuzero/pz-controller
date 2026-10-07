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
        AlteracaoDoPerfil: {
            nome?: string;
            celular?: string;
            /** @description Recebem cópia das notificações. */
            emailsAdicionais?: string[];
        };
        CadastroRealizado: {
            /** Format: uuid */
            usuarioId: string;
            perfil: components["schemas"]["PerfilDoAdvogado"];
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
        Credenciais: {
            email: string;
            senha: string;
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
        PedidoDeTokensDeDispositivo: {
            /** @enum {string} */
            tipoCliente: "web" | "mobile" | "mcp" | "integrador";
            nomeDispositivo: string;
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
            /** @description O que falta para a sessão ficar completa; null quando já está. */
            proximoPasso: ("configurar-2fa" | "verificar-2fa") | null;
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
