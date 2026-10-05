// Gerado por scripts/gerar.ts a partir de openapi.json. Não edite à mão.
export interface paths {
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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
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
        SituacaoDaApi: {
            /** @enum {string} */
            situacao: "operacional" | "degradada";
            /** @description Versão implantada (SHA do commit). */
            versao: string;
            /** Format: date-time */
            verificadoEm: string;
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
}
