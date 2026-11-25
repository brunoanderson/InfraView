// GET /api/health: confirma que a API está no ar e que o banco responde.
// Usado na demonstração para mostrar o 503 quando o banco está fora.
import * as healthService from '../services/health.service.js';

export function health(req, res) {
    res.json(healthService.check());
}
