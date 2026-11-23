// =============================================================================
// AppError: erro "esperado" da aplicação, que já sabe qual resposta HTTP gerar.
//
// Qualquer camada (middleware, service, model) pode fazer
//     throw AppError.notFound('Dispositivo não encontrado.')
// e o errorHandler central transforma isso em
//     404 { "error": { "code": "NOT_FOUND", "message": "Dispositivo não encontrado." } }
// Erros que NÃO são AppError (bugs, falhas inesperadas) viram 500 e a mensagem
// interna não é mostrada ao cliente.
// =============================================================================
export class AppError extends Error {
    /**
     * @param {number} status  código HTTP
     * @param {string} code    identificador estável para o front (ex.: VALIDATION_ERROR)
     * @param {string} message texto em português para exibir ao usuário
     * @param {unknown} [details] informações extras (ex.: erros por campo)
     */
    constructor(status, code, message, details) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code;
        this.details = details;
    }

    /** 400: requisição mal formada ou regra de negócio violada. */
    static badRequest(message = 'Requisição inválida.', details) {
        return new AppError(400, 'BAD_REQUEST', message, details);
    }

    /** 400: dados de entrada não passaram na validação (details = erros por campo). */
    static validation(details, message = 'Dados inválidos. Verifique os campos destacados.') {
        return new AppError(400, 'VALIDATION_ERROR', message, details);
    }

    /** 401: não autenticado (sem token, token inválido/expirado, login errado). */
    static unauthorized(message = 'Faça login para continuar.', code = 'UNAUTHORIZED') {
        return new AppError(401, code, message);
    }

    /** 403: autenticado, mas sem permissão (ex.: viewer tentando excluir). */
    static forbidden(message = 'Você não tem permissão para esta ação.') {
        return new AppError(403, 'FORBIDDEN', message);
    }

    /** 404: recurso ou rota inexistente. */
    static notFound(message = 'Recurso não encontrado.') {
        return new AppError(404, 'NOT_FOUND', message);
    }

    /** 409: conflito com o estado atual (ex.: e-mail ou nome já cadastrado). */
    static conflict(message = 'Conflito com um registro existente.', details) {
        return new AppError(409, 'CONFLICT', message, details);
    }

    /** 500: erro interno (a mensagem real fica só no log do servidor). */
    static internal(message = 'Erro interno do servidor. Tente novamente mais tarde.') {
        return new AppError(500, 'INTERNAL_ERROR', message);
    }

    /** 503: dependência fora do ar (ex.: banco de dados). */
    static serviceUnavailable(message = 'Serviço temporariamente indisponível.', code = 'SERVICE_UNAVAILABLE') {
        return new AppError(503, code, message);
    }
}
