// =============================================================================
// Banco numa versão anterior à do código (migrations pendentes): a API responde
// 503 DATABASE_OUTDATED com a dica do db:migrate, em vez de um 500 sem explicação.
// O banco é REAL (SQLite em memória, só com as migrations 001 a 003). Rodar: npm test
// =============================================================================
import './helpers/env.js'; // primeiro: define o ambiente de teste
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

const { closeDb, openDb } = await import('../src/lib/db.js');
const { listMigrationFiles, migrate } = await import('../db/migrate.js');
const { seed } = await import('../db/seed.js');
const { createApp } = await import('../src/app.js');

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const app = createApp();
const originalError = console.error;
let db;

/** Nada de stack nem de mensagem interna do SQLite. */
function assertClean(res) {
    assert.deepEqual(Object.keys(res.body), ['error']);
    assert.deepEqual(Object.keys(res.body.error).sort(), ['code', 'message']);
    assert.doesNotMatch(JSON.stringify(res.body), /no such|SQLITE|is_root|\bat .*\.js/i);
}

before(() => {
    console.error = () => {}; // 5xx vai para o log; aqui não interessa
    closeDb();
    db = openDb({ create: true });
    db.exec(`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`);
    db.pragma('foreign_keys = OFF');
    for (const name of ['001_init.sql', '002_monitoring.sql', '003_packet_loss.sql']) {
        db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'));
        db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    }
    db.pragma('foreign_keys = ON');
});

after(() => {
    console.error = originalError;
    closeDb();
});

describe('banco na versão 003 (sem a migration 004)', () => {
    test('health -> 503 DATABASE_OUTDATED com a dica do db:migrate', async () => {
        const res = await request(app).get('/api/health');
        assert.equal(res.status, 503);
        assert.equal(res.body.error.code, 'DATABASE_OUTDATED');
        assert.match(res.body.error.message, /npm run db:migrate/);
        assertClean(res);
    });

    test('login -> 503 DATABASE_OUTDATED (a coluna nova não existe), sem a mensagem do SQLite', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'qualquer@teste.local', password: 'Senha123' });
        assert.equal(res.status, 503);
        assert.equal(res.body.error.code, 'DATABASE_OUTDATED');
        assert.match(res.body.error.message, /npm run db:migrate/);
        assertClean(res);
    });
});

describe('banco completo', () => {
    test('depois do db:migrate, o health volta a 200 com a contagem de migrations', async () => {
        migrate(db, { log: () => {} });
        await seed(db, { name: 'Raiz', email: 'raiz@teste.local', password: 'Senha123' });

        const res = await request(app).get('/api/health');
        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'ok');
        assert.equal(res.body.database, 'ok');
        assert.equal(res.body.migrations, listMigrationFiles().length);
        assert.equal((await request(app).post('/api/auth/login').send({ email: 'raiz@teste.local', password: 'Senha123' })).status, 200);
    });
});
