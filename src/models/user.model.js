// =============================================================================
// Model de usuários: só SQL, sem regra de negócio.
// Todas as queries usam parâmetros (?), nunca concatenação de texto: o valor
// vai separado do comando, então não há como injetar SQL pelo e-mail ou nome.
// =============================================================================
import { getDb } from '../lib/db.js';

/** Campos que podem sair na API (nunca o password_hash). */
const PUBLIC_COLUMNS = 'id, name, email, role, is_root AS isRoot, created_at AS createdAt';

/** O SQLite guarda is_root como 0/1; a API devolve boolean. */
const toUser = (row) => row && { ...row, isRoot: row.isRoot === 1 };

/** Todos os usuários: a conta raiz primeiro, depois por nome. */
export function list() {
    return getDb().prepare(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY is_root DESC, name COLLATE NOCASE, id`).all().map(toUser);
}

export function updateRole(id, role) {
    getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

/** Troca o nome e/ou o e-mail (o que vier undefined fica como está). E-mail de outra conta -> UNIQUE -> 409. */
export function updateProfile(id, { name, email }) {
    getDb()
        .prepare('UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE id = ?')
        .run(name ?? null, email ?? null, id);
}

export function updatePasswordHash(id, passwordHash) {
    getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

/** Apaga o usuário. Os alertas que ele reconheceu ficam sem autor (FK com ON DELETE SET NULL). */
export function remove(id) {
    getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
}

/** Usuário público pelo id, ou undefined. */
export function findById(id) {
    return toUser(getDb().prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id));
}

/**
 * Usuário pelo e-mail, INCLUINDO o hash (uso exclusivo do login).
 * A coluna email é COLLATE NOCASE: "Admin@X" e "admin@x" são o mesmo e-mail.
 */
export function findByEmailWithHash(email) {
    return toUser(getDb()
        .prepare(`SELECT ${PUBLIC_COLUMNS}, password_hash AS passwordHash FROM users WHERE email = ?`)
        .get(email));
}

/**
 * Cria o usuário e devolve os campos públicos (RETURNING evita um SELECT extra).
 * Nunca cria a conta raiz: is_root fica no padrão 0.
 * E-mail repetido dispara SQLITE_CONSTRAINT_UNIQUE, que o errorHandler converte em 409.
 */
export function create({ name, email, passwordHash, role = 'viewer' }) {
    return toUser(getDb()
        .prepare(
            `INSERT INTO users (name, email, password_hash, role)
             VALUES (?, ?, ?, ?)
             RETURNING ${PUBLIC_COLUMNS}`,
        )
        .get(name, email, passwordHash, role));
}
