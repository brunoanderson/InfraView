// =============================================================================
// Model de usuários: só SQL, sem regra de negócio.
// Todas as queries usam parâmetros (?), nunca concatenação de texto: o valor
// vai separado do comando, então não há como injetar SQL pelo e-mail ou nome.
// =============================================================================
import { getDb } from '../lib/db.js';

/** Campos que podem sair na API (nunca o password_hash). */
const PUBLIC_COLUMNS = 'id, name, email, role, created_at AS createdAt';

/** Usuário público pelo id, ou undefined. */
export function findById(id) {
    return getDb().prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id);
}

/**
 * Usuário pelo e-mail, INCLUINDO o hash (uso exclusivo do login).
 * A coluna email é COLLATE NOCASE: "Admin@X" e "admin@x" são o mesmo e-mail.
 */
export function findByEmailWithHash(email) {
    return getDb()
        .prepare(`SELECT ${PUBLIC_COLUMNS}, password_hash AS passwordHash FROM users WHERE email = ?`)
        .get(email);
}

/**
 * Cria o usuário e devolve os campos públicos (RETURNING evita um SELECT extra).
 * E-mail repetido dispara SQLITE_CONSTRAINT_UNIQUE, que o errorHandler converte em 409.
 */
export function create({ name, email, passwordHash, role = 'viewer' }) {
    return getDb()
        .prepare(
            `INSERT INTO users (name, email, password_hash, role)
             VALUES (?, ?, ?, ?)
             RETURNING ${PUBLIC_COLUMNS}`,
        )
        .get(name, email, passwordHash, role);
}
