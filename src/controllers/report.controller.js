// =============================================================================
// Controllers das rotas só de leitura: categorias, eventos, alertas, dashboard
// e situação do monitor. (O reconhecimento de alerta também está aqui.)
// =============================================================================
import * as alertModel from '../models/alert.model.js';
import * as categoryModel from '../models/category.model.js';
import * as eventModel from '../models/event.model.js';
import * as monitor from '../monitor/monitor.js';
import * as alertService from '../services/alert.service.js';
import * as dashboardService from '../services/dashboard.service.js';
import { DAY_MS } from '../lib/time.js';

/** GET /api/categories (com contagem de dispositivos) */
export function categories(req, res) {
    res.json({ categories: categoryModel.listWithCounts() });
}

/** GET /api/events?type=todos|downtime|latencia|perda&period=0|7|30|all&device=<id> */
export function events(req, res) {
    const { type, period, device } = req.validated.query;
    const now = new Date();
    // period 0 = últimas 24 horas (janela corrida); "all" = sem filtro de data
    const days = period === 'all' ? null : Math.max(1, Number(period));
    const since = days === null ? null : new Date(now.getTime() - days * DAY_MS).toISOString();
    const filters = { since, deviceId: device ?? null };

    res.json({
        type,
        period,
        since,
        // "todos" traz as três listas; os outros tipos trazem só a sua (as demais vêm vazias)
        downtime: ['todos', 'downtime'].includes(type) ? eventModel.listDowntime({ ...filters, now: now.toISOString() }) : [],
        latency: ['todos', 'latencia'].includes(type) ? eventModel.listLatency(filters) : [],
        loss: ['todos', 'perda'].includes(type) ? eventModel.listLoss(filters) : [],
    });
}

/** GET /api/alerts?status=&severity=&kind= (counts = totais por status, para os badges) */
export function alerts(req, res) {
    res.json({ alerts: alertModel.list(req.validated.query), counts: alertModel.countByStatus() });
}

/** PATCH /api/alerts/:id/ack (admin) */
export function acknowledgeAlert(req, res) {
    res.json({ alert: alertService.acknowledge(req.validated.params.id, req.user) });
}

/** GET /api/dashboard/summary */
export function dashboard(req, res) {
    res.json(dashboardService.summary());
}

/** GET /api/monitor/status (última e próxima rodada) */
export function monitorStatus(req, res) {
    res.json(monitor.getStatus());
}
