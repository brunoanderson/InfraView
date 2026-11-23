// =============================================================================
// Queries usadas pelo monitor: histórico de checks, estado do dispositivo,
// quedas, picos de latência e alertas automáticos.
// Só SQL com parâmetros (?). Quem decide QUANDO chamar cada uma é src/monitor/monitor.js.
// =============================================================================
import { getDb } from '../lib/db.js';

const db = () => getDb();

// ---- Dispositivos ----------------------------------------------------------

/** Ids dos dispositivos com monitoramento ligado (a lista de cada rodada). */
export function listEnabledDeviceIds() {
    return db().prepare('SELECT id FROM devices WHERE monitoring_enabled = 1 ORDER BY id').pluck().all();
}

/** Dados que o monitor precisa de um dispositivo. */
export function findDevice(id) {
    return db()
        .prepare(
            `SELECT id, name, host, check_type, port, status, consecutive_failures,
                    latency_threshold_ms, is_gateway, monitoring_enabled, up_since
             FROM devices WHERE id = ?`,
        )
        .get(id);
}

/** Volta o dispositivo para "pendente", como se nunca tivesse sido verificado. */
export function resetDeviceState(id, note) {
    db()
        .prepare(
            `UPDATE devices
             SET status = 'pendente', consecutive_failures = 0, latency_ms = NULL, status_note = ?, up_since = NULL
             WHERE id = ?`,
        )
        .run(note, id);
}

/** Grava o novo estado calculado pela máquina de estados. */
export function updateDeviceState(id, s) {
    db()
        .prepare(
            `UPDATE devices
             SET status = ?, consecutive_failures = ?, latency_ms = ?, status_note = ?,
                 up_since = ?, last_check_at = ?, last_seen_at = COALESCE(?, last_seen_at)
             WHERE id = ?`,
        )
        .run(s.status, s.consecutiveFailures, s.latencyMs, s.statusNote, s.upSince, s.checkedAt, s.lastSeenAt, id);
}

// ---- Histórico de verificações (checks) ------------------------------------

export function insertCheck(deviceId, checkedAt, result) {
    db()
        .prepare('INSERT INTO checks (device_id, checked_at, success, latency_ms, error) VALUES (?, ?, ?, ?, ?)')
        .run(deviceId, checkedAt, result.success ? 1 : 0, result.latencyMs, result.error);
}

/** Últimas `limit` latências de verificações com sucesso (mais recente primeiro). */
export function recentLatencies(deviceId, limit) {
    return db()
        .prepare(
            `SELECT latency_ms FROM checks
             WHERE device_id = ? AND success = 1 AND latency_ms IS NOT NULL
             ORDER BY checked_at DESC LIMIT ?`,
        )
        .pluck()
        .all(deviceId, limit);
}

/**
 * Quando começou a sequência atual de falhas: é a N-ésima verificação mais
 * recente, onde N = número de falhas seguidas. Vira o início da queda.
 */
export function failureStreakStart(deviceId, failures) {
    return db()
        .prepare('SELECT checked_at FROM checks WHERE device_id = ? ORDER BY checked_at DESC LIMIT 1 OFFSET ?')
        .pluck()
        .get(deviceId, failures - 1);
}

/** Limpeza do histórico antigo. Devolve quantas linhas apagou. */
export function deleteChecksBefore(isoDate) {
    return db().prepare('DELETE FROM checks WHERE checked_at < ?').run(isoDate).changes;
}

// ---- Quedas (downtime) -----------------------------------------------------

export function openDowntime(deviceId, startedAt, reason) {
    db()
        .prepare('INSERT INTO downtime_events (device_id, started_at, reason) VALUES (?, ?, ?)')
        .run(deviceId, startedAt, reason);
}

export function closeDowntime(deviceId, endedAt) {
    db()
        .prepare('UPDATE downtime_events SET ended_at = ? WHERE device_id = ? AND ended_at IS NULL')
        .run(endedAt, deviceId);
}

// ---- Picos de latência -----------------------------------------------------

export function openLatencyEvent(deviceId, recordedAt, latencyMs, thresholdMs) {
    db()
        .prepare(
            'INSERT INTO latency_events (device_id, recorded_at, latency_ms, threshold_ms, resolved) VALUES (?, ?, ?, ?, 0)',
        )
        .run(deviceId, recordedAt, latencyMs, thresholdMs);
}

/** Enquanto o pico continua, guarda o maior valor observado. */
export function raiseLatencyPeak(deviceId, latencyMs) {
    db()
        .prepare('UPDATE latency_events SET latency_ms = MAX(latency_ms, ?) WHERE device_id = ? AND resolved = 0')
        .run(latencyMs, deviceId);
}

export function closeLatencyEvent(deviceId) {
    db().prepare('UPDATE latency_events SET resolved = 1 WHERE device_id = ? AND resolved = 0').run(deviceId);
}

// ---- Alertas automáticos ---------------------------------------------------

export function openAlert({ deviceId, kind, severity, title, message, createdAt }) {
    db()
        .prepare(
            `INSERT INTO alerts (device_id, kind, severity, status, title, message, created_at)
             VALUES (?, ?, ?, 'ativo', ?, ?, ?)`,
        )
        .run(deviceId, kind, severity, title, message, createdAt);
}

/** Resolve o alerta ativo de um tipo ('offline' ou 'latency') do dispositivo. */
export function resolveAlert(deviceId, kind, resolvedAt, note) {
    db()
        .prepare(
            `UPDATE alerts
             SET status = 'resolvido', resolved_at = ?, message = COALESCE(message || ' · ', '') || ?
             WHERE device_id = ? AND kind = ? AND status = 'ativo'`,
        )
        .run(resolvedAt, note, deviceId, kind);
}
