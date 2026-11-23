// =============================================================================
// Ponto de entrada: valida o ambiente, abre o banco e sobe o servidor HTTP.
//   npm run dev    (reinicia sozinho ao salvar, via nodemon)
//   npm start
// =============================================================================
import { env } from './config/env.js'; // importar já valida o .env (para o boot se faltar algo)
import { openDb, closeDb, resolveDbPath } from './lib/db.js';
import { createApp } from './app.js';
import * as monitor from './monitor/monitor.js';

// Banco: se não abrir agora, o servidor sobe mesmo assim e responde 503 até o
// banco existir (getDb() tenta reabrir a cada requisição).
try {
    openDb();
    console.log(`[db] Conectado: ${resolveDbPath()}`);
} catch (err) {
    console.warn(`[db] Banco indisponível (${err.message}). Rode "npm run db:reset". A API responderá 503.`);
}

const app = createApp();

const server = app.listen(env.PORT, () => {
    console.log(`[server] InfraView em http://localhost:${env.PORT} (${env.NODE_ENV})`);
    // O monitor começa depois que o servidor está no ar (um dos alvos da demo é a própria API).
    if (env.MONITOR_ENABLED) monitor.start();
    else console.log('[monitor] Desligado (MONITOR_ENABLED=false).');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[server] A porta ${env.PORT} já está em uso. Feche o outro processo ou mude PORT no .env.`);
    } else {
        console.error('[server] Erro ao iniciar:', err);
    }
    process.exit(1);
});

// Desligamento limpo (Ctrl+C ou sinal do sistema): para o monitor (esperando a
// rodada atual), para de aceitar conexões, espera as requisições e fecha o banco.
async function shutdown(signal) {
    console.log(`\n[server] ${signal} recebido, encerrando...`);
    // Se algo travar, força a saída depois de 10 s.
    setTimeout(() => process.exit(1), 10_000).unref();
    await monitor.stop();
    server.close(() => {
        closeDb();
        console.log('[server] Encerrado.');
        process.exit(0);
    });
    // O navegador mantém conexões keep-alive abertas; sem isto o close() esperaria por elas.
    server.closeIdleConnections();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
