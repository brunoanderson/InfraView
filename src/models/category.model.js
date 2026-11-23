// Model de categorias.
import { getDb } from '../lib/db.js';

/** Categorias com a contagem de dispositivos por situação (tela Rede e dashboard). */
export function listWithCounts() {
    return getDb()
        .prepare(
            `SELECT c.id, c.name, c.slug, c.icon,
                    COUNT(d.id) AS total,
                    -- COUNT(CASE ...) conta só as linhas que entram na condição (e dá 0, nunca NULL)
                    COUNT(CASE WHEN d.monitoring_enabled = 1 AND d.status = 'online'   THEN 1 END) AS online,
                    COUNT(CASE WHEN d.monitoring_enabled = 1 AND d.status = 'atencao'  THEN 1 END) AS atencao,
                    COUNT(CASE WHEN d.monitoring_enabled = 1 AND d.status = 'offline'  THEN 1 END) AS offline,
                    COUNT(CASE WHEN d.monitoring_enabled = 1 AND d.status = 'pendente' THEN 1 END) AS pendente,
                    COUNT(CASE WHEN d.monitoring_enabled = 0 THEN 1 END) AS paused
             FROM categories c
             LEFT JOIN devices d ON d.category_id = c.id
             GROUP BY c.id
             ORDER BY c.id`,
        )
        .all();
}

export function exists(id) {
    return getDb().prepare('SELECT 1 FROM categories WHERE id = ?').get(id) !== undefined;
}
