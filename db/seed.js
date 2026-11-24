// =============================================================================
// db/seed.js — dados iniciais.
//
//   npm run db:seed        -> uso real: só o admin e as 4 categorias. Os
//                             dispositivos você cadastra pela tela.
//   npm run db:seed:demo   -> o mesmo + 6 alvos locais que respondem DE VERDADE,
//                             para a apresentação (nada aqui é inventado: status,
//                             latência, quedas e alertas são todos medidos pelo monitor).
//
// O seed APAGA os dados existentes e insere de novo, numa única transação.
// =============================================================================
import { z } from 'zod';
import { isMain } from '../src/lib/isMain.js';
import { hashPassword } from '../src/lib/password.js';

/** Categorias da tela Rede (as mesmas da versão estática do projeto). */
const CATEGORIES = [
    { name: 'Rede Wi-Fi · Access Points', slug: 'wifi', icon: 'bi-wifi' },
    { name: 'Segurança · CFTV / Alarme', slug: 'seguranca', icon: 'bi-camera-video' },
    { name: 'Energia', slug: 'energia', icon: 'bi-sun' },
    { name: 'Outros Dispositivos', slug: 'outros', icon: 'bi-pc-display' },
];

/** Portas do alvo de demonstração (demo/alvo.js usa as mesmas). Fora das faixas
 *  que o Windows costuma reservar para o Hyper-V (veja: netsh interface ipv4 show excludedportrange protocol=tcp). */
export const DEMO_FAST_PORT = 7010;
export const DEMO_SLOW_PORT = 7011;
export const DEMO_FLAKY_PORT = 7012;

/**
 * Alvos da demonstração. Todos rodam no próprio computador, então funcionam em
 * qualquer rede (inclusive sem internet):
 *   GW-LOCAL       ping 127.0.0.1                -> sempre online
 *   INFRAVIEW-API  tcp localhost:PORT            -> a própria API (por nome, não IP)
 *   CAM-DEMO       tcp 127.0.0.1:7010            -> online só com "npm run demo:alvo" rodando:
 *                                                   pare o alvo para demonstrar uma queda
 *   INVERSOR-DEMO  http 127.0.0.1:7011           -> o alvo responde em ~350 ms, acima do
 *                                                   limite de 200 ms: fica em "atenção"
 *   NAS-FORA       tcp 127.0.0.1:9               -> porta fechada: cai e gera alerta sozinho
 *   REDE-INSTAVEL-DEMO http 127.0.0.1:7012       -> o alvo derruba 2 de cada 5 requisições (40%),
 *                                                   acima do limite de perda de 20%: fica em "atenção"
 */
function demoDevices(apiPort) {
    return [
        { name: 'GW-LOCAL', model: 'Interface de loopback (este computador)', host: '127.0.0.1', checkType: 'ping', port: null, threshold: 100, gateway: 1, icon: 'bi-router', category: 'wifi' },
        { name: 'INFRAVIEW-API', model: 'Servidor InfraView (Express)', host: 'localhost', checkType: 'tcp', port: apiPort, threshold: 100, gateway: 0, icon: 'bi-server', category: 'outros' },
        { name: 'CAM-DEMO', model: 'Alvo de demonstração (npm run demo:alvo)', host: '127.0.0.1', checkType: 'tcp', port: DEMO_FAST_PORT, threshold: 100, gateway: 0, icon: 'bi-camera-video', category: 'seguranca' },
        { name: 'INVERSOR-DEMO', model: 'Alvo lento de demonstração (~350 ms)', host: '127.0.0.1', checkType: 'http', port: DEMO_SLOW_PORT, threshold: 200, gateway: 0, icon: 'bi-brightness-high', category: 'energia' },
        { name: 'NAS-FORA', model: 'Porta fechada (sempre offline)', host: '127.0.0.1', checkType: 'tcp', port: 9, threshold: 100, gateway: 0, icon: 'bi-hdd-stack', category: 'outros' },
        { name: 'REDE-INSTAVEL-DEMO', model: 'Alvo instável de demonstração (perde 40%)', host: '127.0.0.1', checkType: 'http', port: DEMO_FLAKY_PORT, threshold: 100, lossThreshold: 20, gateway: 0, icon: 'bi-wifi', category: 'wifi' },
    ];
}

// ---------------------------------------------------------------------------
// Administrador de demonstração (credenciais vêm do .env)
// ---------------------------------------------------------------------------
const adminSchema = z.object({
    SEED_ADMIN_NAME: z.string().trim().min(2).default('Administrador'),
    SEED_ADMIN_EMAIL: z.email('SEED_ADMIN_EMAIL precisa ser um e-mail válido'),
    SEED_ADMIN_PASSWORD: z.string().min(8, 'SEED_ADMIN_PASSWORD precisa ter pelo menos 8 caracteres'),
});

export function readAdminFromEnv(source = process.env) {
    const parsed = adminSchema.safeParse(source);
    if (!parsed.success) {
        const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new Error(`Credenciais do admin de demonstração inválidas no .env (${problems})`);
    }
    const { SEED_ADMIN_NAME: name, SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password } = parsed.data;
    return { name, email, password };
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/**
 * @param {import('better-sqlite3').Database} db  banco já migrado
 * @param {{ name: string, email: string, password: string }} admin
 * @param {{ demo?: boolean, apiPort?: number }} [options]
 */
export async function seed(db, admin, { demo = false, apiPort = 3000 } = {}) {
    // O bcrypt é assíncrono e a transação do better-sqlite3 precisa ser síncrona:
    // o hash é gerado ANTES de abrir a transação.
    const adminHash = await hashPassword(admin.password);

    const insertCategory = db.prepare('INSERT INTO categories (name, slug, icon) VALUES (?, ?, ?)');
    const insertDevice = db.prepare(`
        INSERT INTO devices
            (name, model, host, check_type, port, latency_threshold_ms, loss_threshold_pct, is_gateway, icon, category_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
        // Filhos antes dos pais, para não violar as chaves estrangeiras.
        // (Nomes de tabela fixos no código, nunca vindos do usuário.)
        for (const table of ['checks', 'alerts', 'loss_events', 'latency_events', 'downtime_events', 'devices', 'categories', 'users']) {
            db.prepare(`DELETE FROM ${table}`).run();
        }

        db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`)
            .run(admin.name, admin.email, adminHash);

        const categoryIds = {};
        for (const c of CATEGORIES) {
            categoryIds[c.slug] = insertCategory.run(c.name, c.slug, c.icon).lastInsertRowid;
        }

        if (demo) {
            for (const d of demoDevices(apiPort)) {
                insertDevice.run(d.name, d.model, d.host, d.checkType, d.port, d.threshold, d.lossThreshold ?? 20, d.gateway, d.icon,
                    categoryIds[d.category]);
            }
        }
    })();

    return countRows(db);
}

/** Quantidade de linhas em cada tabela. */
function countRows(db) {
    const tables = ['users', 'categories', 'devices', 'checks', 'downtime_events', 'latency_events', 'loss_events', 'alerts'];
    return Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get()]));
}

/** Mostra o resultado no terminal. */
export function printSummary(db, admin, demo) {
    console.log(`[seed] Concluído (${demo ? 'modo demonstração' : 'uso real'}):`);
    console.table(countRows(db));
    console.log(`[seed] Admin: ${admin.email} (senha definida em SEED_ADMIN_PASSWORD no .env)`);
    if (demo) console.log('[seed] Rode "npm run demo:alvo" em outro terminal para o CAM-DEMO, o INVERSOR-DEMO e o REDE-INSTAVEL-DEMO responderem.');
}

// ---------------------------------------------------------------------------
// Execução direta: node db/seed.js [--demo]
// ---------------------------------------------------------------------------
if (isMain(import.meta.url)) {
    const { env } = await import('../src/config/env.js');
    const { openDb, closeDb, resolveDbPath } = await import('../src/lib/db.js');
    const { migrate } = await import('./migrate.js');
    const demo = process.argv.includes('--demo');
    try {
        const admin = readAdminFromEnv();
        const db = openDb({ create: true });
        console.log(`[seed] Banco: ${resolveDbPath()}`);
        migrate(db); // garante o schema antes de inserir
        await seed(db, admin, { demo, apiPort: env.PORT });
        printSummary(db, admin, demo);
    } catch (err) {
        console.error(`[seed] Falhou: ${err.message}`);
        process.exitCode = 1;
    } finally {
        closeDb();
    }
}
