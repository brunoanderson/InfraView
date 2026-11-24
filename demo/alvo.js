// =============================================================================
// Alvo de demonstração: três servidores HTTP mínimos, no próprio computador.
//   porta 7010 -> responde na hora      (CAM-DEMO, verificação tcp)
//   porta 7011 -> responde em ~350 ms   (INVERSOR-DEMO, verificação http, limite 200 ms)
//   porta 7012 -> derruba 2 de cada 5   (REDE-INSTAVEL-DEMO, verificação http, limite de perda 20%)
//
// Na demonstração: com este script rodando, o CAM-DEMO fica online, o
// INVERSOR-DEMO em atenção por latência e o REDE-INSTAVEL-DEMO em atenção por
// perda de pacotes. Aperte Ctrl+C e, depois de 3 verificações com falha, o
// monitor marca as quedas e gera os alertas sozinho. Rode de novo e eles são resolvidos.
//
// Uso: npm run demo:alvo
// =============================================================================
import http from 'node:http';
import { DEMO_FAST_PORT, DEMO_FLAKY_PORT, DEMO_SLOW_PORT } from '../db/seed.js';

const SLOW_DELAY_MS = 350;

function listen(port, label, handler) {
    http
        .createServer(handler)
        .listen(port, '127.0.0.1', () => console.log(`[demo] ${label} em http://127.0.0.1:${port}`))
        .on('error', (err) => {
            const reasons = {
                EADDRINUSE: 'já está em uso (o alvo já está rodando em outro terminal?)',
                EACCES: 'reservada pelo Windows (Hyper-V). Veja: netsh interface ipv4 show excludedportrange protocol=tcp',
            };
            console.error(`[demo] Porta ${port}: ${reasons[err.code] ?? err.message}`);
            process.exit(1);
        });
}

listen(DEMO_FAST_PORT, 'alvo rápido (CAM-DEMO)', (req, res) => res.end('InfraView demo: rápido\n'));

listen(DEMO_SLOW_PORT, `alvo lento, ${SLOW_DELAY_MS} ms (INVERSOR-DEMO)`, (req, res) => {
    setTimeout(() => res.end('InfraView demo: lento\n'), SLOW_DELAY_MS);
});

// Instável: derruba a conexão de 2 em cada 5 requisições (40% de perda).
// É uma regra fixa, e não um sorteio, para a demonstração não oscilar: qualquer
// sequência de 12 tentativas (3 verificações) tem pelo menos 4 perdidas (33%).
let requests = 0;
listen(DEMO_FLAKY_PORT, 'alvo instável, perde 2 de cada 5 (REDE-INSTAVEL-DEMO)', (req, res) => {
    if (requests++ % 5 < 2) req.socket.destroy(); // sem resposta: conta como tentativa perdida
    else res.end('InfraView demo: instável\n');
});

console.log('[demo] Ctrl+C para "derrubar" os alvos.');
