// Model das migrations: compara o que o banco já aplicou com os arquivos de db/migrations.
import { listMigrationFiles } from '../../db/migrate.js';
import { getDb } from '../lib/db.js';

/** { applied: quantas já foram aplicadas, pending: nomes dos .sql que ainda faltam }. */
export function status() {
    const applied = new Set(getDb().prepare('SELECT name FROM schema_migrations').pluck().all());
    return {
        applied: applied.size,
        pending: listMigrationFiles().filter((file) => !applied.has(file)),
    };
}
