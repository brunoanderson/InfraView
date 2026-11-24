// Model de alertas (tela Alertas e dashboard).
import { getDb } from '../lib/db.js';

const SELECT_ALERT = `
    SELECT a.id, a.kind, a.title, a.message, a.severity, a.status,
           a.created_at AS createdAt, a.resolved_at AS resolvedAt, a.acknowledged_at AS acknowledgedAt,
           u.id AS ackUserId, u.name AS ackUserName,
           d.id AS deviceId, d.name AS deviceName, d.host AS deviceHost, d.model AS deviceModel
    FROM alerts a
    JOIN devices d ON d.id = a.device_id
    LEFT JOIN users u ON u.id = a.acknowledged_by`;

/** Agrupa os campos do dispositivo e de quem reconheceu. */
function toAlert(row) {
    if (!row) return undefined;
    const { ackUserId, ackUserName, deviceId, deviceName, deviceHost, deviceModel, ...alert } = row;
    return {
        ...alert,
        acknowledgedBy: ackUserId ? { id: ackUserId, name: ackUserName } : null,
        device: { id: deviceId, name: deviceName, host: deviceHost, model: deviceModel },
    };
}

/** Lista com filtros opcionais. Ativos primeiro, depois os mais recentes. */
export function list({ status = null, severity = null, kind = null, limit = -1 } = {}) {
    return getDb()
        .prepare(
            `${SELECT_ALERT}
             WHERE (@status IS NULL OR a.status = @status)
               AND (@severity IS NULL OR a.severity = @severity)
               AND (@kind IS NULL OR a.kind = @kind)
             ORDER BY a.status = 'ativo' DESC, a.created_at DESC
             LIMIT @limit`,
        )
        .all({ status, severity, kind, limit }) // LIMIT -1 = sem limite no SQLite
        .map(toAlert);
}

/** Quantidade por status (badges da tela), sem filtros. */
export function countByStatus() {
    const counts = { ativo: 0, resolvido: 0, info: 0 };
    for (const row of getDb().prepare('SELECT status, COUNT(*) AS n FROM alerts GROUP BY status').all()) {
        counts[row.status] = row.n;
    }
    return counts;
}

export function findById(id) {
    return toAlert(getDb().prepare(`${SELECT_ALERT} WHERE a.id = ?`).get(id));
}

/**
 * Registra o reconhecimento. As condições no WHERE garantem que só um alerta
 * ativo e ainda não reconhecido muda. Devolve quantas linhas mudaram.
 */
export function acknowledge(id, userId, at) {
    return getDb()
        .prepare(
            `UPDATE alerts SET acknowledged_at = ?, acknowledged_by = ?
             WHERE id = ? AND status = 'ativo' AND acknowledged_at IS NULL`,
        )
        .run(at, userId, id).changes;
}
