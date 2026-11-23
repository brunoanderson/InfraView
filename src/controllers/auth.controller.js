// Controllers: só leem a requisição (já validada) e montam a resposta.
// Erros lançados aqui (ou nas camadas de baixo) vão direto para o errorHandler.
import * as authService from '../services/auth.service.js';

/** POST /api/auth/register -> 201 { user, token } */
export async function register(req, res) {
    const result = await authService.register(req.validated.body);
    res.status(201).json(result);
}

/** POST /api/auth/login -> 200 { user, token } */
export async function login(req, res) {
    const result = await authService.login(req.validated.body);
    res.json(result);
}

/** GET /api/auth/me -> 200 { user } (usuário dono do token) */
export function me(req, res) {
    res.json({ user: req.user });
}
