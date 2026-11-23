// =============================================================================
// db/migrate.js — aplica as migrations pendentes.
//
// Como funciona:
//   1. Garante que existe a tabela schema_migrations, o "diário" do banco:
//      cada linha é o nome de um arquivo .sql que já foi aplicado.
//   2. Lista db/migrations/*.sql em ordem alfabética. Por isso os arquivos têm
//      prefixo numérico: 001_init.sql, 002_..., e a ordem de execução é a do nome.
//   3. Compara as duas listas: o que está na pasta e não está no diário é pendente.
//   4. Aplica cada pendente numa transação: executa o SQL e registra o nome.
//      Se o SQL falhar no meio, o ROLLBACK desfaz tudo, inclusive o registro,
//      e o banco continua na versão anterior, sem ficar pela metade.
//
// Rodar de novo é seguro (idempotente): sem pendências, nada acontece.
// Regra: nunca edite uma migration já aplicada; crie uma nova (002_..., 003_...).
//
// Uso: npm run db:migrate
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Aplica no banco `db` as migrations ainda não registradas.
 * Exportada para ser reaproveitada pelo seed, pelo reset e pelos testes.
 * @returns {string[]} nomes das migrations aplicadas nesta execução
 */
export function migrate(db, { log = console.log } = {}) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name       TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )
    `);

    // .pluck() devolve só o valor da primeira coluna: ['001_init.sql', ...]
    const applied = new Set(db.prepare('SELECT name FROM schema_migrations').pluck().all());

    const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((file) => /^\d{3}_[\w-]+\.sql$/.test(file))
        .sort();

    const pending = files.filter((file) => !applied.has(file));

    if (pending.length === 0) {
        log('[migrate] Banco atualizado: nenhuma migration pendente.');
        return [];
    }

    const register = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');

    // db.transaction() devolve uma função que roda o corpo entre BEGIN e COMMIT
    // e faz ROLLBACK automaticamente se algo lançar exceção.
    const applyOne = db.transaction((name, sql) => {
        db.exec(sql);
        register.run(name);
    });

    for (const name of pending) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
        applyOne(name, sql);
        log(`[migrate] Aplicada: ${name}`);
    }

    return pending;
}

// ---------------------------------------------------------------------------
// Execução direta (node db/migrate.js). Quando o arquivo é só importado
// (pelo seed ou pelos testes), este bloco não roda.
// ---------------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    const { openDb, closeDb, resolveDbPath } = await import('../src/lib/db.js');
    try {
        const db = openDb({ create: true });
        console.log(`[migrate] Banco: ${resolveDbPath()}`);
        migrate(db);
    } catch (err) {
        console.error(`[migrate] Falhou: ${err.message}`);
        process.exitCode = 1;
    } finally {
        closeDb();
    }
}
