// =============================================================================
// events.js — eventos do monitor (quedas, picos de latência e perda de pacotes)
// como vêm de GET /api/events. Usado pelo Dashboard e pelos Relatórios.
// =============================================================================
import { formatDuration } from './ui.js';

export const EVENT_TYPES = {
    downtime: { label: 'Queda', icon: 'bi-wifi-off', iconClass: 'severity-critical' },
    latency: { label: 'Latência alta', icon: 'bi-graph-up-arrow', iconClass: 'severity-warning' },
    loss: { label: 'Perda de pacotes', icon: 'bi-reception-1', iconClass: 'severity-warning' },
};

/**
 * Junta as três listas da API numa só, do mais recente para o mais antigo.
 * Cada item ganha: type, key (única entre os tipos), at (quando começou),
 * open (se ainda está acontecendo) e text (resumo em português).
 */
export function mergeEvents({ downtime = [], latency = [], loss = [] }) {
    const items = [
        ...downtime.map((e) => ({
            ...e, type: 'downtime', key: `d${e.id}`, at: e.startedAt, open: e.ongoing,
            text: e.ongoing ? `Fora do ar há ${formatDuration(e.durationSeconds)}` : `Ficou ${formatDuration(e.durationSeconds)} fora do ar`,
        })),
        ...latency.map((e) => ({
            ...e, type: 'latency', key: `l${e.id}`, at: e.recordedAt, open: !e.resolved,
            text: `Pico de ${e.latencyMs} ms (limite ${e.thresholdMs} ms)`,
        })),
        ...loss.map((e) => ({
            ...e, type: 'loss', key: `p${e.id}`, at: e.recordedAt, open: !e.resolved,
            text: `Perda de ${e.lossPct}% (limite ${e.thresholdPct}%)`,
        })),
    ];
    return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
