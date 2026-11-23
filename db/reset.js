// =============================================================================
// db/reset.js — recria o banco do zero: apaga o arquivo, aplica todas as
// migrations e roda o seed.
//
//   npm run db:reset        (uso real)
//   npm run db:reset:demo   (com os alvos de demonstração)
//
// Pare o servidor antes: no Windows o arquivo fica bloqueado enquanto outro
// processo o mantém aberto.
// =============================================================================
import fs from 'node:fs';
import { env } from '../src/config/env.js';
import { openDb, closeDb, resolveDbPath } from '../src/lib/db.js';
import { migrate } from './migrate.js';
import { seed, readAdminFromEnv, printSummary } from './seed.js';

const file = resolveDbPath();
const demo = process.argv.includes('--demo');

try {
    const admin = readAdminFromEnv(); // valida antes de apagar qualquer coisa

    if (file !== ':memory:') {
        // -journal: arquivo temporário do modo padrão do SQLite;
        // -wal/-shm: só existiriam se o modo WAL tivesse sido ligado.
        for (const suffix of ['', '-journal', '-wal', '-shm']) {
            fs.rmSync(file + suffix, { force: true });
        }
        console.log(`[reset] Banco apagado: ${file}`);
    }

    const db = openDb({ create: true });
    migrate(db);
    await seed(db, admin, { demo, apiPort: env.PORT });
    printSummary(db, admin, demo);
} catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
        console.error('[reset] O arquivo do banco está em uso. Pare o servidor (npm run dev) e tente de novo.');
    } else {
        console.error(`[reset] Falhou: ${err.message}`);
    }
    process.exitCode = 1;
} finally {
    closeDb();
}
