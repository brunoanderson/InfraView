// Controller do dashboard e da situação do monitor.
import * as monitor from '../monitor/monitor.js';
import * as dashboardService from '../services/dashboard.service.js';

/** GET /api/dashboard/summary */
export function summary(req, res) {
    res.json(dashboardService.summary());
}

/** GET /api/monitor/status (última e próxima rodada) */
export function monitorStatus(req, res) {
    res.json(monitor.getStatus());
}
