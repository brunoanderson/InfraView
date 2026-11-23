// Rota inexistente: vira um 404 no formato padrão (fica antes do errorHandler).
import { AppError } from '../errors/AppError.js';

export function notFound(req, res, next) {
    next(AppError.notFound(`Rota não encontrada: ${req.method} ${req.path}`));
}
