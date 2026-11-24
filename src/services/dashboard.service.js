// =============================================================================
// Monta o resumo do dashboard. Tudo calculado na hora a partir do banco.
// Valores sem base (sem gateway, sem verificações) saem como null; a tela mostra "—".
// =============================================================================
import * as alertModel from '../models/alert.model.js';
import * as categoryModel from '../models/category.model.js';
import * as dashboardModel from '../models/dashboard.model.js';
import { DAY_MS } from '../lib/time.js';

export function summary(now = Date.now()) {
    const since = new Date(now - DAY_MS).toISOString(); // janela: últimas 24 horas

    return {
        generatedAt: new Date(now).toISOString(),
        devices: dashboardModel.deviceCounts(),
        activeAlerts: dashboardModel.activeAlertCount(),
        averageLatencyMs: dashboardModel.averageLatency(since),
        averageLoss24hPct: dashboardModel.averageLoss(since),
        devicesWithActiveLoss: dashboardModel.devicesWithActiveLoss(),
        gateway: gatewaySummary(since),
        categories: categoryModel.listWithCounts(),
        recentAlerts: alertModel.list({ status: 'ativo', limit: 5 }),
        latencies: dashboardModel.latencyByDevice(since),
    };
}

function gatewaySummary(since) {
    const gateway = dashboardModel.findGateway();
    if (!gateway) return null;

    const stats = dashboardModel.checkStats(gateway.id, since);
    return {
        ...gateway,
        monitoringEnabled: gateway.monitoringEnabled === 1,
        checks24h: stats.total,
        // ex.: 2870 sucessos em 2880 verificações -> 99.7 (%)
        availability24h: stats.total > 0 ? Math.round((stats.successes / stats.total) * 1000) / 10 : null,
        averageLatency24hMs: stats.averageLatencyMs,
        averageLoss24hPct: dashboardModel.averageLoss(since, gateway.id),
    };
}
