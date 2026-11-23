// GET /api/health: confirma que a API está no ar e que o banco responde.
// Usado na demonstração para mostrar o 503 quando o banco está fora.
import { getDb } from '../lib/db.js';
import { databaseUnavailable } from '../errors/databaseErrors.js';

export function health(req, res) {
    let migrations;
    try {
        // Consulta real ao banco (não só "a conexão existe").
        migrations = getDb().prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get();
    } catch {
        throw databaseUnavailable();
    }

    res.json({
        status: 'ok',
        database: 'ok',
        migrations,
        uptimeSeconds: Math.round(process.uptime()),
        time: new Date().toISOString(),
    });
}
