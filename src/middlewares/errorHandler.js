// =============================================================================
// Tratamento de erros CENTRALIZADO.
//
// Fica por último em app.js. No Express 5, qualquer erro lançado numa rota ou
// middleware (inclusive em funções async) chega aqui automaticamente; não é
// preciso try/catch em cada controller.
//
// Toda resposta de erro tem o mesmo formato:
//     { "error": { "code": "...", "message": "...", "details": ... } }
// Detalhes internos (stack trace, mensagem do SQLite) nunca vão na resposta, em
// nenhum ambiente: ficam só no log do servidor.
// =============================================================================
import { AppError } from '../errors/AppError.js';
import { fromDatabaseError } from '../errors/databaseErrors.js';

/** Converte qualquer erro em AppError. */
function normalize(err) {
    if (err instanceof AppError) return err;

    // Erros do SQLite (UNIQUE, FOREIGN KEY, banco fora do ar...)
    const dbError = fromDatabaseError(err);
    if (dbError) return dbError;

    // Erros gerados pelo express.json() ao ler o corpo da requisição
    if (err?.type === 'entity.parse.failed') {
        return new AppError(400, 'INVALID_JSON', 'O corpo da requisição não é um JSON válido.');
    }
    if (err?.type === 'entity.too.large') {
        return new AppError(413, 'PAYLOAD_TOO_LARGE', 'O corpo da requisição é grande demais.');
    }

    return AppError.internal();
}

// eslint-disable-next-line no-unused-vars -- o Express só reconhece o handler de erro pelos 4 parâmetros
export function errorHandler(err, req, res, next) {
    const appError = normalize(err);

    // 5xx é problema do servidor: registra o erro original (com o stack) no log,
    // para investigação. (O corpo da requisição não é registrado: pode ter senha.)
    if (appError.status >= 500) {
        console.error(`[erro] ${req.method} ${req.originalUrl}:`, err);
    }

    const body = { code: appError.code, message: appError.message };
    if (appError.details !== undefined) body.details = appError.details;

    // Se a resposta já começou a ser enviada, só resta encerrar a conexão.
    if (res.headersSent) return req.socket.destroy();

    res.status(appError.status).json({ error: body });
}
