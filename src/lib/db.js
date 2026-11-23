// =============================================================================
// Conexão com o SQLite (better-sqlite3).
//
// better-sqlite3 é síncrono: cada query bloqueia só por microssegundos num banco
// local, e o código fica sem async/await nos models, o que é mais fácil de ler.
// A aplicação usa uma única conexão, aberta no boot e reaproveitada.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env, ROOT_DIR } from '../config/env.js';
import { databaseUnavailable } from '../errors/databaseErrors.js';

let connection = null;

/** Converte DATABASE_URL em caminho absoluto (":memory:" fica como está). */
export function resolveDbPath(url = env.DATABASE_URL) {
    return url === ':memory:' ? url : path.resolve(ROOT_DIR, url);
}

/**
 * Abre a conexão.
 * @param {object}  [options]
 * @param {string}  [options.url]    caminho do banco (padrão: DATABASE_URL)
 * @param {boolean} [options.create] true nos scripts de migrate/seed. O servidor
 *   usa false: se o arquivo não existir, falha em vez de criar um banco vazio
 *   (sem tabelas), e o erro vira 503 com a dica de rodar "npm run db:reset".
 */
export function openDb({ url = env.DATABASE_URL, create = false } = {}) {
    if (connection) return connection;

    const file = resolveDbPath(url);
    if (file !== ':memory:' && create) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
    }

    const db = new Database(file, { fileMustExist: !create });

    // O SQLite vem com as chaves estrangeiras DESLIGADAS por padrão, e a opção
    // vale por conexão. Sem esta linha, REFERENCES e ON DELETE CASCADE seriam ignorados.
    db.pragma('foreign_keys = ON');

    connection = db;
    return db;
}

/**
 * Devolve a conexão aberta. Se o banco ainda não abriu (ex.: arquivo ausente no
 * boot), tenta de novo a cada requisição: assim, depois de um "npm run db:reset",
 * o servidor volta a funcionar sem precisar reiniciar. Enquanto não abrir, a
 * requisição recebe 503.
 */
export function getDb() {
    if (connection) return connection;
    try {
        return openDb();
    } catch (err) {
        console.error(`[db] Não foi possível abrir o banco: ${err.message}`);
        throw databaseUnavailable();
    }
}

/** Fecha a conexão (usado no desligamento do servidor e nos testes). */
export function closeDb() {
    if (connection) {
        connection.close();
        connection = null;
    }
}
