// =============================================================================
// Limite de tentativas no login e no cadastro (por IP).
//
// Sem limite, um atacante poderia testar milhares de senhas por minuto. Com ele,
// depois de AUTH_LIMIT tentativas na janela de 15 minutos, o IP recebe
// 429 Too Many Requests até a janela acabar. Os contadores ficam em memória
// (suficiente para um único servidor; zeram ao reiniciar).
// =============================================================================
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const WINDOW_MINUTES = 15;
// Nos testes automáticos o limite é alto para não bloquear as várias requisições de login.
const AUTH_LIMIT = env.isTest ? 1000 : 10;

export const authLimiter = rateLimit({
    windowMs: WINDOW_MINUTES * 60 * 1000,
    limit: AUTH_LIMIT,
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
