// =============================================================================
// As verificações em si.
//
// Cada verificação faz ATTEMPTS tentativas AO MESMO TEMPO e junta o resultado:
//     { success, latencyMs, error, packetsSent, packetsLost }
//   success     = pelo menos uma tentativa respondeu (se todas falharam, é queda)
//   latencyMs   = média das tentativas que responderam
//   packetsLost = tentativas sem resposta. A "perda de pacotes" é lost / sent:
//                 no ping são pacotes perdidos; no tcp/http, conexões ou
//                 requisições que falharam.
// As funções nunca lançam exceção (falhar é um resultado normal, não um erro).
//
//   ping -> ICMP, mede o próprio aparelho (padrão)
//   tcp  -> tenta conectar numa porta; mede o tempo do handshake. Útil quando o
//           aparelho bloqueia ping (o Firewall do Windows bloqueia por padrão)
//   http -> GET http://host:porta/; mede o tempo até a resposta. É o único que
//           enxerga um servidor LENTO (no tcp, quem completa a conexão é o
//           sistema operacional, então a latência não muda)
// =============================================================================
import { execFile } from 'node:child_process';
import net from 'node:net';

const isWindows = process.platform === 'win32';

// Tentativas por verificação. Em paralelo, e não em sequência, para a verificação
// continuar rápida: o "ping -n 4" do Windows espera 1 s entre um pacote e outro.
const ATTEMPTS = 4;

/**
 * Ping via o comando do sistema. O Node não envia ICMP sem privilégios de
 * administrador, e o comando ping já tem essa permissão.
 *
 * Segurança: execFile + array de argumentos NÃO passa por shell, então um host
 * como "1.1.1.1 & del *" seria só um argumento inválido, nunca um comando. O
 * validator também recusa espaços e hosts começando com "-" (que virariam flags).
 */
export function ping(host, timeoutMs) {
    // As flags mudam: Windows -n (quantidade) -w (ms); Linux -c (quantidade) -W (segundos)
    const args = isWindows
        ? ['-n', '1', '-w', String(timeoutMs), host]
        : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), host];

    return new Promise((resolve) => {
        execFile('ping', args, { timeout: timeoutMs + 1000, windowsHide: true }, (err, stdout = '') => {
            // A saída vem no idioma do sistema ("Resposta de 127.0.0.1: ... tempo<1ms TTL=128",
            // "64 bytes from ...: time=0.04 ms"). Por isso procuramos só o que não muda
            // com o idioma: o tempo ("=12ms", "<1ms", "= 0.04 ms"), que só aparece
            // quando chegou uma resposta de verdade.
            // (O exit code não basta: no Windows, "host de destino inacessível" sai com 0,
            // mas essa linha não tem tempo.)
            const match = /([=<])\s*([\d.]+)\s*ms/i.exec(stdout);
            if (!match) {
                return resolve({ success: false, latencyMs: null, error: 'Sem resposta ao ping' });
            }
            // "<1ms" (menos de 1 ms) vira 0
            const latencyMs = match[1] === '<' ? 0 : Math.round(Number(match[2]));
            resolve({ success: true, latencyMs, error: null });
        });
    });
}

/** Conexão TCP numa porta: conectou dentro do tempo = no ar. */
export function tcp(host, port, timeoutMs) {
    return new Promise((resolve) => {
        const start = performance.now();
        const socket = net.connect({ host, port, timeout: timeoutMs });

        const finish = (result) => {
            socket.destroy(); // só queríamos saber se conecta; fecha na hora
            resolve(result);
        };
        socket.once('connect', () =>
            finish({ success: true, latencyMs: Math.round(performance.now() - start), error: null }),
        );
        socket.once('timeout', () => finish({ success: false, latencyMs: null, error: 'Tempo esgotado' }));
        socket.once('error', (err) => finish({ success: false, latencyMs: null, error: describeNetworkError(err) }));
    });
}

/** GET http://host:porta/. Qualquer resposta abaixo de 500 conta como no ar. */
export async function http(host, port, timeoutMs) {
    const hostInUrl = host.includes(':') ? `[${host}]` : host; // IPv6 vai entre colchetes na URL
    const start = performance.now();
    try {
        const res = await fetch(`http://${hostInUrl}:${port}/`, {
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'manual', // mede ESTE servidor, sem seguir para outro
        });
        await res.body?.cancel(); // não precisamos do conteúdo
        const latencyMs = Math.round(performance.now() - start);
        return res.status < 500
            ? { success: true, latencyMs, error: null }
            : { success: false, latencyMs: null, error: `Respondeu HTTP ${res.status}` };
    } catch (err) {
        if (err.name === 'TimeoutError') return { success: false, latencyMs: null, error: 'Tempo esgotado' };
        return { success: false, latencyMs: null, error: describeNetworkError(err.cause ?? err) };
    }
}

/** UMA tentativa, conforme o tipo cadastrado no dispositivo. */
function attempt(device, timeoutMs) {
    switch (device.check_type) {
        case 'tcp':
            return tcp(device.host, device.port, timeoutMs);
        case 'http':
            return http(device.host, device.port, timeoutMs);
        default:
            return ping(device.host, timeoutMs);
    }
}

/** Faz ATTEMPTS tentativas em paralelo e junta os resultados (veja o topo do arquivo). */
export async function runCheck(device, timeoutMs) {
    const results = await Promise.all(Array.from({ length: ATTEMPTS }, () => attempt(device, timeoutMs)));
    return summarize(results);
}

/** Junta várias tentativas num resultado só. Exportada para os testes. */
export function summarize(results) {
    const answered = results.filter((r) => r.success);
    const latencies = answered.map((r) => r.latencyMs).filter((ms) => typeof ms === 'number');
    const failed = results.find((r) => !r.success);
    return {
        success: answered.length > 0,
        latencyMs: latencies.length ? Math.round(latencies.reduce((sum, ms) => sum + ms, 0) / latencies.length) : null,
        error: failed ? failed.error : null, // motivo da falha (também quando a perda é parcial)
        packetsSent: results.length,
        packetsLost: results.length - answered.length,
    };
}

/** Erros de rede do Node -> texto em português para a tela. */
function describeNetworkError(err) {
    const messages = {
        ECONNREFUSED: 'Conexão recusada (porta fechada)',
        ENOTFOUND: 'Host não encontrado (DNS)',
        EAI_AGAIN: 'Host não encontrado (DNS)',
        EHOSTUNREACH: 'Host inacessível',
        ENETUNREACH: 'Rede inacessível',
        ECONNRESET: 'Conexão encerrada pelo dispositivo',
        UND_ERR_SOCKET: 'Conexão encerrada pelo dispositivo', // o servidor fechou a conexão no meio da resposta (fetch)
        ETIMEDOUT: 'Tempo esgotado',
    };
    // o fetch recusa algumas portas por segurança (ex.: 9, 25, 6000) sem nem tentar
    if (err?.message === 'bad port') return 'Porta não permitida para HTTP (use tcp)';
    return messages[err?.code] ?? `Falha de rede (${err?.code ?? err?.message ?? 'desconhecida'})`;
}
