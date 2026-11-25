// =============================================================================
// Testes da migration 004 (perfis e conta raiz) num banco "antigo": só com as
// migrations 001 a 003 aplicadas e dados do jeito que existiam antes dela.
// Rodar: npm test
// =============================================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { migrate } from '../db/migrate.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const LEGACY = ['001_init.sql', '002_monitoring.sql', '003_packet_loss.sql'];

/** Banco em memória na versão 003, com dois admins, um viewer e um alerta reconhecido. */
function legacyDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    db.exec(`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`);
    for (const name of LEGACY) {
        db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'));
        db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    }
    db.pragma('foreign_keys = ON');

    const insertUser = db.prepare('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    insertUser.run(3, 'Viewer Antigo', 'viewer@antigo.local', 'hash-viewer', 'viewer', '2026-01-01T00:00:00.000Z');
    insertUser.run(5, 'Primeiro Admin', 'admin1@antigo.local', 'hash-admin1', 'admin', '2026-01-02T00:00:00.000Z');
    insertUser.run(8, 'Segundo Admin', 'admin2@antigo.local', 'hash-admin2', 'admin', '2026-01-03T00:00:00.000Z');
    db.prepare(`INSERT INTO categories (id, name, slug, icon) VALUES (1, 'Outros', 'outros', 'bi-hdd')`).run();
    db.prepare(`INSERT INTO devices (id, name, host, check_type, category_id) VALUES (1, 'ALVO', '10.0.0.1', 'ping', 1)`).run();
    db.prepare(
        `INSERT INTO alerts (id, device_id, kind, severity, status, title, acknowledged_at, acknowledged_by)
         VALUES (1, 1, 'offline', 'critical', 'ativo', 'ALVO está offline', '2026-01-04T00:00:00.000Z', 8)`,
    ).run();
    return db;
}

const usersOf = (db) => db.prepare('SELECT id, name, email, password_hash, role, is_root, created_at FROM users ORDER BY id').all();

describe('migration 004: super admin e conta raiz', () => {
    test('o admin mais antigo vira o super admin raiz; o resto dos dados continua igual', () => {
        const db = legacyDb();
        assert.deepEqual(migrate(db, { log: () => {} }), ['004_super_admin.sql']);

        assert.deepEqual(usersOf(db), [
            { id: 3, name: 'Viewer Antigo', email: 'viewer@antigo.local', password_hash: 'hash-viewer', role: 'viewer', is_root: 0, created_at: '2026-01-01T00:00:00.000Z' },
            { id: 5, name: 'Primeiro Admin', email: 'admin1@antigo.local', password_hash: 'hash-admin1', role: 'superadmin', is_root: 1, created_at: '2026-01-02T00:00:00.000Z' },
            { id: 8, name: 'Segundo Admin', email: 'admin2@antigo.local', password_hash: 'hash-admin2', role: 'admin', is_root: 0, created_at: '2026-01-03T00:00:00.000Z' },
        ]);
        assert.equal(db.prepare('SELECT acknowledged_by FROM alerts WHERE id = 1').pluck().get(), 8);
        assert.deepEqual(db.pragma('foreign_key_check'), []);
        assert.equal(db.pragma('foreign_keys', { simple: true }), 1);

        // a chave estrangeira de alerts continua valendo depois de recriar users
        db.prepare('DELETE FROM users WHERE id = 8').run();
        assert.equal(db.prepare('SELECT acknowledged_by FROM alerts WHERE id = 1').pluck().get(), null);
        // e o e-mail continua único, sem diferenciar maiúsculas
        assert.throws(() => db.prepare(`INSERT INTO users (name, email, password_hash) VALUES ('Outro', 'ADMIN1@antigo.local', 'x')`).run(), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    });

    test('uma segunda raiz é impossível e a raiz só pode ser superadmin', () => {
        const db = legacyDb();
        migrate(db, { log: () => {} });

        assert.throws(() => db.prepare('UPDATE users SET role = ?, is_root = 1 WHERE id = 8').run('superadmin'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
        assert.throws(
            () => db.prepare(`INSERT INTO users (name, email, password_hash, role, is_root) VALUES ('Outra Raiz', 'raiz2@antigo.local', 'x', 'superadmin', 1)`).run(),
            { code: 'SQLITE_CONSTRAINT_UNIQUE' },
        );
        assert.throws(() => db.prepare(`UPDATE users SET role = 'admin' WHERE is_root = 1`).run(), { code: 'SQLITE_CONSTRAINT_CHECK' });
        assert.throws(() => db.prepare(`UPDATE users SET role = 'root' WHERE id = 3`).run(), { code: 'SQLITE_CONSTRAINT_CHECK' });
        assert.equal(db.prepare('SELECT COUNT(*) FROM users WHERE is_root = 1').pluck().get(), 1);
    });

    test('banco sem nenhum admin: ninguém vira raiz (o seed cria a raiz depois)', () => {
        const db = legacyDb();
        db.prepare(`UPDATE users SET role = 'viewer'`).run();
        migrate(db, { log: () => {} });
        assert.equal(db.prepare('SELECT COUNT(*) FROM users WHERE is_root = 1 OR role = ?').pluck().get('superadmin'), 0);
    });
});
