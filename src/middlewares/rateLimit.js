// =============================================================================
// Limite de tentativas no login e no cadastro (por IP).
//
// Sem limite, um atacante poderia testar milhares de senhas por minuto. Com ele,
// depois de AUTH_LIMIT tentativas na janela de 15 minutos, o IP recebe
// 429 Too Many Requests até a janela acabar. Os contadores ficam em memória
// (suficiente para um único servidor; zeram ao reiniciar).
//
// Login e cadastro têm contadores separados:
//   * login: só as tentativas que FALHAM contam. Quem acerta a senha não gasta o
//     limite (vários usuários atrás do mesmo IP podem entrar normalmente);
//   * cadastro: conta toda requisição, para não permitir criar contas em massa.
// =============================================================================
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const WINDOW_MINUTES = 15;
// Nos testes automáticos o limite é alto para não bloquear as várias requisições de login.
const AUTH_LIMIT = env.isTest ? 1000 : 10;

/**
 * Cria um limitador de tentativas. Cada chamada tem o seu próprio contador.
 * @param {object}  [options]
 * @param {number}  [options.limit]  tentativas por janela de 15 minutos
 * @param {boolean} [options.skipSuccessfulRequests]  true: respostas abaixo de 400 não contam
 */
export function createAuthLimiter({ limit = AUTH_LIMIT, skipSuccessfulRequests = false } = {}) {
    return rateLimit({
        windowMs: WINDOW_MINUTES * 60 * 1000,
        limit,
        skipSuccessfulRequests,
        standardHeaders: 'draft-8', // envia o cabeçalho RateLimit com o que resta
        legacyHeaders: false,
        // Resposta no mesmo formato de erro do resto da API
        handler: (req, res, next, options) => {
            res.status(options.statusCode).json({
                error: {
                    code: 'TOO_MANY_REQUESTS',
                    message: `Muitas tentativas. Aguarde ${WINDOW_MINUTES} minutos e tente novamente.`,
                },
            });
        },
    });
}

export const loginLimiter = createAuthLimiter({ skipSuccessfulRequests: true });
export const registerLimiter = createAuthLimiter();
