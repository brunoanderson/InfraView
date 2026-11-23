// =============================================================================
// Alvo de demonstração: dois servidores HTTP mínimos, no próprio computador.
//   porta 7010 -> responde na hora      (CAM-DEMO, verificação tcp)
//   porta 7011 -> responde em ~350 ms   (INVERSOR-DEMO, verificação http, limite 200 ms)
//
// Na apresentação: com este script rodando, o CAM-DEMO fica online. Aperte
// Ctrl+C e, depois de 3 verificações com falha, o monitor marca a queda e gera o
// alerta sozinho. Rode de novo e o alerta é resolvido.
//
// Uso: npm run demo:alvo
// =============================================================================
import http from 'node:http';
import { DEMO_FAST_PORT, DEMO_SLOW_PORT } from '../db/seed.js';

const SLOW_DELAY_MS = 350;

function listen(port, delayMs, label) {
    http
        .createServer((req, res) => {
            setTimeout(() => res.end(`InfraView demo: ${label}\n`), delayMs);
        })
        .listen(port, '127.0.0.1', () => console.log(`[demo] ${label} em http://127.0.0.1:${port} (atraso ${delayMs} ms)`))
        .on('error', (err) => {
            const reasons = {
                EADDRINUSE: 'já está em uso (o alvo já está rodando em outro terminal?)',
                EACCES: 'reservada pelo Windows (Hyper-V). Veja: netsh interface ipv4 show excludedportrange protocol=tcp',
            };
            console.error(`[demo] Porta ${port}: ${reasons[err.code] ?? err.message}`);
            process.exit(1);
        });
}

listen(DEMO_FAST_PORT, 0, 'alvo rápido (CAM-DEMO)');
listen(DEMO_SLOW_PORT, SLOW_DELAY_MS, 'alvo lento (INVERSOR-DEMO)');
console.log('[demo] Ctrl+C para "derrubar" os alvos.');
