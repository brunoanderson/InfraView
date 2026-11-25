// Eventos da tela Relatórios: quedas, picos de latência e perda de pacotes.
import { DAY_MS } from '../lib/time.js';
import * as eventModel from '../models/event.model.js';

/**
 * Lista os eventos do tipo, período e dispositivo pedidos.
 * period 0 = últimas 24 horas (janela corrida); 7 e 30 = dias; "all" = sem filtro de data.
 * "todos" traz as três listas; os outros tipos trazem só a sua (as demais vêm vazias).
 * @param {{ type: string, period: string, device?: number }} query  já validada
 */
export function list({ type, period, device }, now = new Date()) {
    const days = period === 'all' ? null : Math.max(1, Number(period));
    const since = days === null ? null : new Date(now.getTime() - days * DAY_MS).toISOString();
    const filters = { since, deviceId: device ?? null };

    return {
        type,
        period,
        since,
        downtime: ['todos', 'downtime'].includes(type) ? eventModel.listDowntime({ ...filters, now: now.toISOString() }) : [],
        latency: ['todos', 'latencia'].includes(type) ? eventModel.listLatency(filters) : [],
        loss: ['todos', 'perda'].includes(type) ? eventModel.listLoss(filters) : [],
    };
}
