// Situação da API para o GET /api/health: o banco responde e está na versão do código?
import { databaseOutdated, databaseUnavailable } from '../errors/databaseErrors.js';
import * as migrationModel from '../models/migration.model.js';

/** Resumo de saúde. 503 DATABASE_UNAVAILABLE se o banco não responde; 503 DATABASE_OUTDATED se há migration pendente. */
export function check() {
    let migrations;
    try {
        migrations = migrationModel.status(); // consulta real ao banco, não só "a conexão existe"
    } catch {
        throw databaseUnavailable();
    }
    if (migrations.pending.length > 0) throw databaseOutdated();

    return {
        status: 'ok',
        database: 'ok',
        migrations: migrations.applied,
        uptimeSeconds: Math.round(process.uptime()),
        time: new Date().toISOString(),
    };
}
