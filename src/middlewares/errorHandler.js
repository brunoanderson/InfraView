// =============================================================================
// Tratamento de erros CENTRALIZADO.
//
// Fica por último em app.js. No Express 5, qualquer erro lançado numa rota ou
// middleware (inclusive em funções async) chega aqui automaticamente; não é
// preciso try/catch em cada controller.
//
// Toda resposta de erro tem o mesmo formato:
//     { "error": { "code": "...", "message": "...", "details": ... } }
// O stack trace só é incluído com NODE_ENV=development, e apenas em erros inesperados (500).
// =============================================================================
import { env } from '../config/env.js';
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

    // 5xx é problema do servidor: registra o erro original para investigação.
    // (O corpo da requisição não é registrado, porque pode conter senha.)
    if (appError.status >= 500) {
        console.error(`[erro] ${req.method} ${req.originalUrl}:`, err);
    }

    const body = { code: appError.code, message: appError.message };
    if (appError.details !== undefined) body.details = appError.details;
    // Stack trace ajuda a depurar falhas inesperadas, mas expõe detalhes internos:
    // só em desenvolvimento e só para falhas inesperadas (500 que não é AppError).
    // Nos erros previstos (4xx, 503) a causa já está na mensagem.
    if (env.isDev && appError.status >= 500 && !(err instanceof AppError) && err?.stack) {
        body.stack = err.stack;
    }

    // Se a resposta já começou a ser enviada, só resta encerrar a conexão.
    if (res.headersSent) return req.socket.destroy();

    res.status(appError.status).json({ error: body });
}
