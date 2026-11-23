// =============================================================================
// Model dos eventos (tela Relatórios): quedas e picos de latência.
// Parâmetros nomeados (@since, @deviceId): "(@since IS NULL OR ...)" desliga o
// filtro quando ele não foi pedido, sem montar SQL diferente para cada caso.
// =============================================================================
import { getDb } from '../lib/db.js';

/**
 * Quedas. A duração é CALCULADA (não fica guardada): fim - início, em segundos.
 * Se a queda ainda está em andamento, conta até agora (@now).
 */
export function listDowntime({ since = null, deviceId = null, now }) {
    return getDb()
        .prepare(
            `SELECT e.id, e.started_at AS startedAt, e.ended_at AS endedAt, e.reason,
                    e.ended_at IS NULL AS ongoing,
                    CAST(ROUND((julianday(COALESCE(e.ended_at, @now)) - julianday(e.started_at)) * 86400) AS INTEGER)
                        AS durationSeconds,
                    d.id AS deviceId, d.name AS deviceName, d.host AS deviceHost
             FROM downtime_events e
             JOIN devices d ON d.id = e.device_id
             WHERE (@since IS NULL OR e.started_at >= @since)
               AND (@deviceId IS NULL OR e.device_id = @deviceId)
             ORDER BY e.started_at DESC`,
        )
        .all({ since, deviceId, now })
        .map((row) => ({ ...row, ongoing: row.ongoing === 1 }));
}

/** Picos de latência acima do limite. */
export function listLatency({ since = null, deviceId = null }) {
    return getDb()
        .prepare(
            `SELECT e.id, e.recorded_at AS recordedAt, e.latency_ms AS latencyMs,
                    e.threshold_ms AS thresholdMs, e.resolved,
                    d.id AS deviceId, d.name AS deviceName, d.host AS deviceHost
             FROM latency_events e
             JOIN devices d ON d.id = e.device_id
             WHERE (@since IS NULL OR e.recorded_at >= @since)
               AND (@deviceId IS NULL OR e.device_id = @deviceId)
             ORDER BY e.recorded_at DESC`,
        )
        .all({ since, deviceId })
        .map((row) => ({ ...row, resolved: row.resolved === 1 }));
}
