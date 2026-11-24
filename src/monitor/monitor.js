// =============================================================================
// O monitor: roda dentro do próprio servidor e verifica os dispositivos sozinho.
//
// Ciclo:  rodada -> espera MONITOR_INTERVAL_SECONDS -> rodada -> ...
//   * setTimeout encadeado (e não setInterval): a próxima rodada só é agendada
//     quando a atual TERMINA, então rodadas nunca se acumulam se a rede estiver lenta.
//   * Cada rodada relê do banco os dispositivos com monitoramento ligado. Por isso
//     cadastrar, editar, pausar ou excluir vale na rodada seguinte, sem nada extra.
//   * No máximo CONCURRENCY verificações ao mesmo tempo.
//
// Para cada verificação, applyResult() grava TUDO numa única transação: o check,
// o novo estado do dispositivo e os eventos/alertas das transições.
// =============================================================================
import { env } from '../config/env.js';
import { getDb } from '../lib/db.js';
import { DAY_MS, HOUR_MS } from '../lib/time.js';
import * as model from '../models/monitor.model.js';
import { runCheck } from './checkers.js';
import { nextState } from './stateMachine.js';

const CONCURRENCY = 5; // verificações simultâneas por rodada
const LATENCY_SAMPLES = 3; // a "atenção" usa a média das últimas 3 latências
const LOSS_SAMPLES = 3; // e a perda acumulada das últimas 3 verificações com resposta (3 x 4 = 12 tentativas)
const RETENTION_DAYS = 7; // histórico de checks guardado
const CLEANUP_EVERY_MS = HOUR_MS; // limpeza do histórico: uma vez por hora

// A função que faz a verificação de verdade. Os testes trocam por uma falsa
// (setCheckFunction) para simular quedas sem depender da rede.
let checkFn = runCheck;
export function setCheckFunction(fn) {
    checkFn = fn ?? runCheck;
}

const inFlight = new Set(); // dispositivos sendo verificados agora (evita checar o mesmo 2x)
let timer = null;
let running = false;
let currentRound = null;
let lastRoundAt = null;
let nextRoundAt = null;
let lastCleanupAt = 0;

/**
 * Só MEDE (não grava). Devolve null se não deve verificar: não existe, está
 * pausado ou já está sendo verificado.
 */
async function measure(deviceId) {
    if (inFlight.has(deviceId)) return null;
    const device = model.findDevice(deviceId);
    if (!device || !device.monitoring_enabled) return null;

    inFlight.add(deviceId);
    try {
        const result = await checkFn(device, env.MONITOR_TIMEOUT_MS);
        return { deviceId, result, checkedAt: new Date().toISOString(), target: targetOf(device) };
    } finally {
        inFlight.delete(deviceId);
    }
}

/** "ping:192.168.0.1:" — identifica O QUE foi medido, para descartar medições de um alvo antigo. */
const targetOf = (device) => `${device.check_type}:${device.host.toLowerCase()}:${device.port ?? ''}`;

/**
 * Verifica UM dispositivo agora e grava o resultado.
 * Usado pelo cadastro e pelo botão "Verificar agora".
 * @returns resumo do novo estado, ou null se não verificou
 */
export async function checkDevice(deviceId) {
    const measured = await measure(deviceId);
    return measured && applyResult(measured);
}

/**
 * Fecha tudo o que estava aberto (queda, pico, alertas ativos) e volta o
 * dispositivo para "pendente". Usado ao pausar, religar ou trocar o alvo.
 * @param {string} note motivo, gravado no alerta resolvido e no dispositivo
 */
export function resetMonitoring(deviceId, note) {
    const now = new Date().toISOString();
    getDb().transaction(() => {
        model.closeDowntime(deviceId, now);
        model.closeLatencyEvent(deviceId);
        model.closeLossEvent(deviceId);
        model.resolveAlert(deviceId, 'offline', now, note);
        model.resolveAlert(deviceId, 'latency', now, note);
        model.resolveAlert(deviceId, 'loss', now, note);
        model.resetDeviceState(deviceId, note);
    })();
}

/** Grava o resultado de uma verificação e executa as transições, numa transação. */
function applyResult({ deviceId, result: measured, checkedAt, target }) {
    // Verificações sem contagem de tentativas (ex.: as falsas dos testes antigos)
    // valem como 1 tentativa: perdida se falhou, respondida se deu certo.
    const result = {
        ...measured,
        packetsSent: measured.packetsSent ?? 1,
        packetsLost: measured.packetsLost ?? (measured.success ? 0 : 1),
    };

    return getDb().transaction(() => {
        // Relê dentro da transação: o dispositivo pode ter sido apagado, pausado ou
        // ter o alvo trocado enquanto o ping estava em andamento. O resultado é descartado.
        const device = model.findDevice(deviceId);
        if (!device || !device.monitoring_enabled) return null;
        if (target && target !== targetOf(device)) return null;

        model.insertCheck(device.id, checkedAt, result);

        const next = nextState(
            {
                status: device.status,
                consecutiveFailures: device.consecutive_failures,
                latencyThresholdMs: device.latency_threshold_ms,
                lossThresholdPct: device.loss_threshold_pct,
            },
            result,
            {
                failureThreshold: env.MONITOR_FAILURE_THRESHOLD,
                recentLatencies: result.success ? model.recentLatencies(device.id, LATENCY_SAMPLES) : [],
                recentLoss: model.recentPacketTotals(device.id, LOSS_SAMPLES),
                active: model.openProblems(device.id),
            },
        );
        const avg = next.averageLatencyMs;
        const limit = device.latency_threshold_ms;
        const lossPct = next.lossPct;
        const lossLimit = device.loss_threshold_pct;

        // "No ar desde": zera ao cair e recomeça no primeiro sucesso depois disso.
        let upSince = device.up_since;
        if (next.status === 'offline') upSince = null;
        else if (result.success && !upSince) upSince = checkedAt;

        // Observação: o erro, se caiu; ou qual(is) problema(s) deixam em atenção.
        let statusNote = null;
        if (!result.success) {
            statusNote = result.error;
        } else if (next.status === 'atencao') {
            const notes = [];
            if (next.slow) notes.push(`Latência alta: média de ${avg} ms (limite ${limit} ms)`);
            if (next.lossy) notes.push(`Perda de pacotes: ${lossPct}% (limite ${lossLimit}%)`);
            statusNote = notes.join(' · ');
        }

        model.updateDeviceState(device.id, {
            status: next.status,
            consecutiveFailures: next.consecutiveFailures,
            latencyMs: result.latencyMs,
            lastLossPct: Math.round((result.packetsLost / result.packetsSent) * 100), // perda DESTA verificação
            statusNote,
            upSince,
            checkedAt,
            lastSeenAt: result.success ? checkedAt : null,
        });

        // Transições -> eventos e alertas. Só acontecem na MUDANÇA de estado, então
        // enquanto a situação continua nada é duplicado.
        for (const transition of next.transitions) {
            if (transition === 'offline') {
                // a queda começa na PRIMEIRA falha da sequência, não na que confirmou
                const startedAt = model.failureStreakStart(device.id, next.consecutiveFailures) ?? checkedAt;
                model.openDowntime(device.id, startedAt, result.error);
                model.openAlert({
                    deviceId: device.id, kind: 'offline', severity: 'critical', createdAt: checkedAt,
                    title: `${device.name} está offline`,
                    message: `${result.error} (${next.consecutiveFailures} falhas seguidas)`,
                });
            } else if (transition === 'back_online') {
                model.closeDowntime(device.id, checkedAt);
                model.resolveAlert(device.id, 'offline', checkedAt, 'Voltou a responder');
            } else if (transition === 'latency_high') {
                model.openLatencyEvent(device.id, checkedAt, avg, limit);
                model.openAlert({
                    deviceId: device.id, kind: 'latency', severity: 'warning', createdAt: checkedAt,
                    title: `Latência alta em ${device.name}`,
                    message: `Média de ${avg} ms (limite: ${limit} ms)`,
                });
            } else if (transition === 'latency_ok') {
                model.closeLatencyEvent(device.id);
                const note = next.status === 'offline' ? 'Encerrado: o dispositivo ficou offline' : 'Latência normalizada';
                model.resolveAlert(device.id, 'latency', checkedAt, note);
            } else if (transition === 'loss_high') {
                model.openLossEvent(device.id, checkedAt, lossPct, lossLimit);
                model.openAlert({
                    deviceId: device.id, kind: 'loss', severity: 'warning', createdAt: checkedAt,
                    title: `Perda de pacotes em ${device.name}`,
                    message: `${lossPct}% das tentativas sem resposta nas últimas verificações (limite: ${lossLimit}%)`,
                });
            } else if (transition === 'loss_ok') {
                model.closeLossEvent(device.id);
                const note = next.status === 'offline' ? 'Encerrado: o dispositivo ficou offline' : 'Perda normalizada';
                model.resolveAlert(device.id, 'loss', checkedAt, note);
            }
        }
        // Problema em andamento: guarda o pior valor observado. Só com medição de
        // sucesso: uma falha (ainda abaixo do limiar) mantém "atencao", mas sem medição nova.
        if (result.success && next.slow && !next.transitions.includes('latency_high')) {
            model.raiseLatencyPeak(device.id, avg);
        }
        if (result.success && next.lossy && !next.transitions.includes('loss_high')) {
            model.raiseLossPeak(device.id, lossPct);
        }

        if (next.transitions.length > 0) {
            console.log(`[monitor] ${device.name}: ${device.status} -> ${next.status} (${next.transitions.join(', ')})`);
        }
        return {
            deviceId: device.id, status: next.status, latencyMs: result.latencyMs, lossPct: next.lossPct,
            transitions: next.transitions,
        };
    })();
}

/** Executa `worker` para cada item, no máximo `limit` ao mesmo tempo. */
async function runWithLimit(items, limit, worker) {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
        while (queue.length > 0) await worker(queue.shift());
    });
    await Promise.all(workers);
}

/**
 * Uma rodada: 1) mede todos os dispositivos ativos; 2) grava tudo de uma vez.
 *
 * Por que separar? Gravar no SQLite é síncrono: cada COMMIT espera o disco
 * confirmar e, enquanto isso, o Node fica parado. Num HD isso leva ~100 ms, e
 * esse tempo entrava na latência das medições que ainda estavam em andamento
 * (a API local aparecia com 400 ms). Medindo antes e gravando depois numa única
 * transação, nenhuma medição espera o disco e há um só COMMIT por rodada.
 */
async function runRound() {
    const ids = model.listEnabledDeviceIds();
    const measurements = [];
    await runWithLimit(ids, CONCURRENCY, async (id) => {
        const m = await measure(id);
        if (m) measurements.push(m);
    });

    getDb().transaction(() => {
        for (const m of measurements) {
            try {
                applyResult(m);
            } catch (err) {
                // um dispositivo com problema não pode impedir a gravação dos outros
                // (o applyResult dele é desfeito sozinho, como uma transação interna)
                console.error(`[monitor] Erro ao gravar o dispositivo ${m.deviceId}: ${err.message}`);
            }
        }
    })();
    lastRoundAt = new Date().toISOString();

    if (Date.now() - lastCleanupAt >= CLEANUP_EVERY_MS) {
        lastCleanupAt = Date.now();
        const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS).toISOString();
        const removed = model.deleteChecksBefore(cutoff);
        if (removed > 0) console.log(`[monitor] Limpeza: ${removed} verificações com mais de ${RETENTION_DAYS} dias apagadas.`);
    }
}

/** Liga o monitor: primeira rodada imediata, depois uma a cada intervalo. */
export function start() {
    if (running) return;
    running = true;
    const intervalMs = env.MONITOR_INTERVAL_SECONDS * 1000;

    const tick = async () => {
        currentRound = runRound().catch((err) => console.error(`[monitor] Rodada falhou: ${err.message}`));
        await currentRound;
        currentRound = null;
        if (!running) return; // stop() foi chamado durante a rodada
        nextRoundAt = new Date(Date.now() + intervalMs).toISOString();
        timer = setTimeout(tick, intervalMs);
    };

    console.log(`[monitor] Ligado: a cada ${env.MONITOR_INTERVAL_SECONDS}s, timeout ${env.MONITOR_TIMEOUT_MS}ms, offline após ${env.MONITOR_FAILURE_THRESHOLD} falhas.`);
    tick();
}

/** Desliga o monitor e espera a rodada em andamento terminar (desligamento limpo). */
export async function stop() {
    running = false;
    clearTimeout(timer);
    nextRoundAt = null;
    await currentRound;
}

/** Situação do monitor (para a API e a tela). */
export function getStatus() {
    return {
        enabled: env.MONITOR_ENABLED,
        running,
        intervalSeconds: env.MONITOR_INTERVAL_SECONDS,
        lastRoundAt,
        nextRoundAt,
    };
}
