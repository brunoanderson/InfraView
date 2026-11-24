// =============================================================================
// Model do dashboard: números calculados na hora a partir de devices e checks.
// "Disponibilidade" = verificações com sucesso / total de verificações na janela.
// =============================================================================
import { getDb } from '../lib/db.js';

/** Quantos dispositivos em cada situação. Pausados contam à parte. */
export function deviceCounts() {
    return getDb()
        .prepare(
            `SELECT COUNT(*) AS total,
                    COUNT(CASE WHEN monitoring_enabled = 1 AND status = 'online'   THEN 1 END) AS online,
                    COUNT(CASE WHEN monitoring_enabled = 1 AND status = 'atencao'  THEN 1 END) AS atencao,
                    COUNT(CASE WHEN monitoring_enabled = 1 AND status = 'offline'  THEN 1 END) AS offline,
                    COUNT(CASE WHEN monitoring_enabled = 1 AND status = 'pendente' THEN 1 END) AS pendente,
                    COUNT(CASE WHEN monitoring_enabled = 0 THEN 1 END) AS paused
             FROM devices`,
        )
        .get();
}

export function activeAlertCount() {
    return getDb().prepare(`SELECT COUNT(*) FROM alerts WHERE status = 'ativo'`).pluck().get();
}

/** Latência média de todas as verificações com sucesso desde `since` (null se não houver). */
export function averageLatency(since) {
    return getDb()
        .prepare('SELECT ROUND(AVG(latency_ms)) FROM checks WHERE success = 1 AND checked_at >= ?')
        .pluck()
        .get(since);
}

/**
 * Perda média desde `since`: tentativas sem resposta / tentativas feitas, em %
 * (null se não houver verificações). Com `deviceId`, só daquele dispositivo.
 * Como no gatilho de perda, só entram verificações em que algo respondeu: a falha
 * total já aparece como queda e na disponibilidade.
 */
export function averageLoss(since, deviceId = null) {
    const row = getDb()
        .prepare(
            `SELECT SUM(packets_sent) AS sent, SUM(packets_lost) AS lost FROM checks
             WHERE success = 1 AND checked_at >= @since AND (@deviceId IS NULL OR device_id = @deviceId)`,
        )
        .get({ since, deviceId });
    return row.sent ? Math.round((row.lost / row.sent) * 1000) / 10 : null; // 1 casa decimal
}

/** Quantos dispositivos têm um evento de perda de pacotes aberto agora. */
export function devicesWithActiveLoss() {
    return getDb().prepare('SELECT COUNT(DISTINCT device_id) FROM loss_events WHERE resolved = 0').pluck().get();
}

/** O gateway (o primeiro marcado como tal), ou undefined. */
export function findGateway() {
    return getDb()
        .prepare(
            `SELECT id, name, host, status, monitoring_enabled AS monitoringEnabled,
                    up_since AS upSince, last_check_at AS lastCheckAt
             FROM devices WHERE is_gateway = 1 ORDER BY id LIMIT 1`,
        )
        .get();
}

/** Total de verificações, sucessos e latência média de um dispositivo desde `since`. */
export function checkStats(deviceId, since) {
    return getDb()
        .prepare(
            `SELECT COUNT(*) AS total,
                    COUNT(CASE WHEN success = 1 THEN 1 END) AS successes,
                    ROUND(AVG(CASE WHEN success = 1 THEN latency_ms END)) AS averageLatencyMs
             FROM checks WHERE device_id = ? AND checked_at >= ?`,
        )
        .get(deviceId, since);
}

/** Última latência e média desde `since` de cada dispositivo que respondeu, do mais rápido ao mais lento. */
export function latencyByDevice(since) {
    return getDb()
        .prepare(
            `SELECT d.id, d.name, d.status, d.latency_ms AS latencyMs, d.latency_threshold_ms AS latencyThresholdMs,
                    ROUND(AVG(c.latency_ms)) AS averageLatencyMs
             FROM devices d
             JOIN checks c ON c.device_id = d.id AND c.success = 1 AND c.checked_at >= ?
             GROUP BY d.id
             ORDER BY averageLatencyMs, d.name`,
        )
        .all(since);
}
