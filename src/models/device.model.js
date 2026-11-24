// =============================================================================
// Model de dispositivos: só SQL.
// Os filtros da listagem montam a cláusula WHERE com pedaços FIXOS escritos
// aqui no código; o que o usuário digitou entra só como parâmetro (?).
// =============================================================================
import { getDb } from '../lib/db.js';

const SELECT_DEVICE = `
    SELECT d.id, d.name, d.model, d.host, d.check_type, d.port, d.status, d.status_note,
           d.latency_ms, d.latency_threshold_ms, d.last_loss_pct, d.loss_threshold_pct, d.is_gateway, d.icon, d.monitoring_enabled,
           d.consecutive_failures, d.up_since, d.last_seen_at, d.last_check_at,
           d.created_at, d.updated_at,
           c.id AS category_id, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon
    FROM devices d
    JOIN categories c ON c.id = d.category_id`;

/** Linha do banco (snake_case, 0/1) -> objeto da API (camelCase, true/false). */
function toDevice(row) {
    if (!row) return undefined;
    return {
        id: row.id,
        name: row.name,
        model: row.model,
        host: row.host,
        checkType: row.check_type,
        port: row.port,
        status: row.status,
        statusNote: row.status_note,
        latencyMs: row.latency_ms,
        latencyThresholdMs: row.latency_threshold_ms,
        lastLossPct: row.last_loss_pct,
        lossThresholdPct: row.loss_threshold_pct,
        isGateway: row.is_gateway === 1,
        icon: row.icon,
        monitoringEnabled: row.monitoring_enabled === 1,
        consecutiveFailures: row.consecutive_failures,
        upSince: row.up_since,
        lastSeenAt: row.last_seen_at,
        lastCheckAt: row.last_check_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        category: { id: row.category_id, name: row.category_name, slug: row.category_slug, icon: row.category_icon },
    };
}

/** Escapa % e _ para a busca tratá-los como texto, não como curinga do LIKE. */
const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

export function list({ status, search, categoryId } = {}) {
    const where = [];
    const params = [];

    if (status) {
        where.push('d.status = ?');
        params.push(status);
    }
    if (categoryId) {
        where.push('d.category_id = ?');
        params.push(categoryId);
    }
    if (search) {
        where.push(`(d.name LIKE ? ESCAPE '\\' OR d.host LIKE ? ESCAPE '\\' OR IFNULL(d.model, '') LIKE ? ESCAPE '\\')`);
        const term = `%${escapeLike(search)}%`;
        params.push(term, term, term);
    }

    const sql = `${SELECT_DEVICE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.id, d.name`;
    return getDb().prepare(sql).all(...params).map(toDevice);
}

export function findById(id) {
    return toDevice(getDb().prepare(`${SELECT_DEVICE} WHERE d.id = ?`).get(id));
}

/** Insere e devolve o id. Nome repetido ou host+tipo+porta repetidos -> UNIQUE -> 409. */
export function create(d) {
    return getDb()
        .prepare(
            `INSERT INTO devices
                (name, model, host, check_type, port, latency_threshold_ms, loss_threshold_pct, is_gateway, icon,
                 monitoring_enabled, category_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING id`,
        )
        .pluck()
        .get(d.name, d.model, d.host, d.checkType, d.port, d.latencyThresholdMs, d.lossThresholdPct, d.isGateway ? 1 : 0,
            d.icon, d.monitoringEnabled ? 1 : 0, d.categoryId);
}

/** Atualiza só a configuração. Devolve quantas linhas mudaram (0 = não existe). */
export function update(id, d) {
    return getDb()
        .prepare(
            `UPDATE devices
             SET name = ?, model = ?, host = ?, check_type = ?, port = ?, latency_threshold_ms = ?,
                 loss_threshold_pct = ?, is_gateway = ?, icon = ?, monitoring_enabled = ?, category_id = ?,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?`,
        )
        .run(d.name, d.model, d.host, d.checkType, d.port, d.latencyThresholdMs, d.lossThresholdPct, d.isGateway ? 1 : 0,
            d.icon, d.monitoringEnabled ? 1 : 0, d.categoryId, id).changes;
}

/** Apaga; checks, quedas, picos e alertas do dispositivo vão junto (ON DELETE CASCADE). */
export function remove(id) {
    return getDb().prepare('DELETE FROM devices WHERE id = ?').run(id).changes;
}
