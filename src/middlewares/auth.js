// =============================================================================
// Autenticação (quem é você?) e autorização (você pode fazer isso?).
//
// authenticate: exige o cabeçalho  Authorization: Bearer <token>
//   - sem token ou token malformado -> 401 UNAUTHORIZED
//   - token expirado               -> 401 TOKEN_EXPIRED
//   - assinatura inválida          -> 401 INVALID_TOKEN
//   - usuário do token foi apagado -> 401 UNAUTHORIZED
//   Se der certo, coloca o usuário em req.user. O usuário é relido do banco a
//   cada requisição, então uma mudança de papel ou exclusão vale na hora.
//
// requireRole('admin'): usado DEPOIS de authenticate; papel errado -> 403.
// =============================================================================
import jwt from 'jsonwebtoken';
import { AppError } from '../errors/AppError.js';
import { verifyToken } from '../lib/jwt.js';
import * as userModel from '../models/user.model.js';

export function authenticate(req, res, next) {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return next(AppError.unauthorized('Faça login para continuar.'));
    }

    let payload;
    try {
        payload = verifyToken(token);
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            return next(AppError.unauthorized('Sua sessão expirou. Faça login novamente.', 'TOKEN_EXPIRED'));
        }
        return next(AppError.unauthorized('Sessão inválida. Faça login novamente.', 'INVALID_TOKEN'));
    }

    const user = userModel.findById(Number(payload.sub));
    if (!user) {
        return next(AppError.unauthorized('Usuário não encontrado. Faça login novamente.'));
    }

    req.user = user;
    next();
}

export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return next(AppError.unauthorized());
        if (!roles.includes(req.user.role)) {
            return next(AppError.forbidden('Apenas administradores podem realizar esta ação.'));
        }
        next();
    };
}
