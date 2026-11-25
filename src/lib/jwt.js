// =============================================================================
// Criação e verificação do token JWT.
//
// O token é assinado com JWT_SECRET (HMAC-SHA256). Quem não conhece o segredo
// não consegue criar nem alterar um token válido: se mudar um único caractere
// do payload (por exemplo, o id do usuário), a assinatura deixa de bater.
// O payload NÃO é criptografado (qualquer um decodifica em base64), por isso
// guardamos só o id do usuário. O perfil (superadmin, admin ou viewer) NÃO vai
// no token: o authenticate lê o usuário no banco a cada requisição, então uma
// promoção, um rebaixamento ou uma exclusão valem na hora.
// =============================================================================
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ALGORITHM = 'HS256';

/** Gera o token de um usuário. "sub" (subject) é o id do usuário. */
export function signToken(user) {
    return jwt.sign({}, env.JWT_SECRET, {
        subject: String(user.id),
        expiresIn: env.JWT_EXPIRES_IN,
        algorithm: ALGORITHM,
    });
}

/**
 * Verifica assinatura e validade. Lança TokenExpiredError ou JsonWebTokenError.
 * O algoritmo é fixado para impedir tokens forjados com "alg": "none".
 */
export function verifyToken(token) {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
}
