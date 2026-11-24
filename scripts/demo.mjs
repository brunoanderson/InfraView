// =============================================================================
// npm run demo — prepara e sobe a demonstração num terminal só:
//   1. confere se as portas estão livres (a da API e as 7010/7011/7012 do alvo);
//   2. recria o banco com os dados de demonstração (o mesmo que npm run db:reset:demo);
//   3. sobe o alvo de demonstração (demo/alvo.js) e o servidor com nodemon (como npm run dev).
//
// Enquanto roda:
//   a + Enter  derruba o alvo (para mostrar as quedas) ou o religa
//   Ctrl+C     encerra tudo, inclusive os processos filhos
// =============================================================================
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import { env, ROOT_DIR } from '../src/config/env.js'; // valida o .env antes de tudo
import { DEMO_FAST_PORT, DEMO_FLAKY_PORT, DEMO_SLOW_PORT } from '../db/seed.js';

const isWindows = process.platform === 'win32';
const GRACE_MS = 12_000; // o servidor espera a rodada do monitor (até 10 s) antes de sair
const NODEMON = path.join(ROOT_DIR, 'node_modules', 'nodemon', 'bin', 'nodemon.js');

const log = (text) => console.log(`[demo] ${text}`);

// ---- 1. Portas livres? (antes de mexer no banco) --------------------------

/** Tenta abrir a porta do mesmo jeito que o processo de verdade vai abrir. */
function checkPort(port, host) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.once('error', (err) => resolve(err.code));
        probe.once('listening', () => probe.close(() => resolve(null)));
        probe.listen(port, host);
    });
}

const PORTS = [
    { port: env.PORT, host: undefined, who: 'servidor InfraView, PORT do .env' }, // igual ao app.listen(PORT)
    { port: DEMO_FAST_PORT, host: '127.0.0.1', who: 'alvo do CAM-DEMO' },
    { port: DEMO_SLOW_PORT, host: '127.0.0.1', who: 'alvo do INVERSOR-DEMO' },
    { port: DEMO_FLAKY_PORT, host: '127.0.0.1', who: 'alvo do REDE-INSTAVEL-DEMO' },
];

let problems = 0;
for (const { port, host, who } of PORTS) {
    const code = await checkPort(port, host);
    if (!code) continue;
    problems++;
    if (code === 'EADDRINUSE') {
        console.error(`[demo] A porta ${port} (${who}) já está em uso. Feche o programa que a usa`
            + ' (outro "npm run dev", "npm run demo:alvo" ou "npm run demo"?) e rode de novo.');
    } else if (code === 'EACCES') {
        console.error(`[demo] A porta ${port} (${who}) está reservada pelo sistema.`
            + ' No Windows, veja: netsh interface ipv4 show excludedportrange protocol=tcp');
    } else {
        console.error(`[demo] Não foi possível usar a porta ${port} (${who}): ${code}`);
    }
}
if (problems > 0) {
    console.error('[demo] Nada foi iniciado e o banco não foi alterado.');
    process.exit(1);
}

// ---- 2. Banco de demonstração ----------------------------------------------
// Antes de subir o servidor: no Windows, o arquivo aberto por outro processo fica bloqueado.
log('Recriando o banco com os dados de demonstração (apaga os dados atuais)...');
const reset = spawnSync(process.execPath, ['db/reset.js', '--demo'], { cwd: ROOT_DIR, stdio: 'inherit' });
if (reset.status !== 0) {
    console.error('[demo] A recriação do banco falhou (mensagem acima). Nada foi iniciado.');
    process.exit(1);
}

// ---- 3. Alvo e servidor no mesmo terminal ----------------------------------
// stdin 'ignore': o teclado fica com este script (o nodemon também leria o terminal).
const STDIO = ['ignore', 'inherit', 'inherit'];
let stopping = false;
let server = null;
let target = null;

/** Sobe um processo filho. Se ele parar sem ninguém ter pedido, encerra a demonstração. */
function startChild(label, args, { expectedExit = () => false } = {}) {
    const child = spawn(process.execPath, args, { cwd: ROOT_DIR, stdio: STDIO });
    child.label = label;
    child.on('exit', (code, signal) => {
        child.exited = true;
        if (stopping) {
            if (allExited()) finish();
        } else if (!expectedExit(child)) {
            console.error(`[demo] O ${label} parou sozinho (${signal ?? `código ${code}`}). Encerrando o resto.`);
            shutdown(1);
        }
    });
    return child;
}

function startTarget() {
    target = startChild('alvo de demonstração', ['demo/alvo.js'], { expectedExit: (c) => c.stoppedOnPurpose });
}

const running = () => [server, target].filter((c) => c && !c.exited);
const allExited = () => running().length === 0;

function finish() {
    log('Tudo encerrado.');
    process.exit(process.exitCode ?? 0);
}

/** Encerra o processo e os filhos dele (no Windows, o kill() não alcança os netos do nodemon). */
function forceKill(child) {
    if (child.exited) return;
    if (isWindows) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
        child.kill('SIGKILL');
    }
}

/**
 * @param {number} exitCode
 * @param {boolean} fromConsole true no Ctrl+C: o terminal já mandou o sinal a todos
 *        os processos dele, então os filhos se encerram sozinhos (o servidor fecha
 *        o banco direito). Nos outros casos, o pedido parte daqui.
 */
function shutdown(exitCode, fromConsole = false) {
    if (stopping) return;
    stopping = true;
    process.exitCode = exitCode;
    log('Encerrando o alvo e o servidor...');
    for (const child of running()) {
        if (isWindows) {
            if (!fromConsole) forceKill(child); // no Windows não há como mandar um "Ctrl+C" a um só processo
        } else if (!fromConsole) {
            child.kill('SIGINT');
        }
    }
    // Rede de segurança: quem não saiu no prazo é encerrado à força.
    setTimeout(() => {
        const left = running();
        if (left.length > 0) {
            log(`Encerramento forçado: ${left.map((c) => c.label).join(', ')}.`);
            left.forEach(forceKill);
        }
        process.exit(process.exitCode);
    }, GRACE_MS).unref();
    if (allExited()) finish();
}

process.on('SIGINT', () => shutdown(0, true)); // Ctrl+C
process.on('SIGBREAK', () => shutdown(0, true)); // Ctrl+Break (Windows)
process.on('SIGTERM', () => shutdown(0)); // pedido de outro programa
process.on('SIGHUP', () => shutdown(0)); // terminal fechado

startTarget();
server = startChild('servidor', [NODEMON, '--watch', 'src', '--ext', 'js', 'src/server.js']);

// a + Enter: derruba ou religa o alvo. terminal: false deixa o Ctrl+C com o sistema (vira SIGINT).
readline.createInterface({ input: process.stdin, terminal: false }).on('line', (line) => {
    if (stopping || line.trim().toLowerCase() !== 'a') return;
    if (target && !target.exited) {
        target.stoppedOnPurpose = true;
        forceKill(target);
        log('Alvo DERRUBADO. Depois de 3 verificações com falha, CAM-DEMO, INVERSOR-DEMO e REDE-INSTAVEL-DEMO ficam offline.');
        log('Digite a + Enter para religar.');
    } else {
        startTarget();
        log('Alvo religado. Na próxima verificação os dispositivos voltam.');
    }
});

// As instruções saem depois das mensagens de início do alvo e do servidor. (O alvo
// sugere "Ctrl+C para derrubar"; aqui o Ctrl+C encerra tudo e quem derruba o alvo é o "a".)
setTimeout(() => {
    if (stopping) return;
    log(`Painel: http://localhost:${env.PORT}  (login: SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD do .env)`);
    log(`O monitor verifica a cada ${env.MONITOR_INTERVAL_SECONDS} s`
        + (env.MONITOR_INTERVAL_SECONDS > 5 ? ' (para a apresentação, use MONITOR_INTERVAL_SECONDS=5 no .env).' : '.'));
    log('Neste terminal: a + Enter derruba ou religa o alvo; Ctrl+C encerra tudo.');
}, 3000).unref();
