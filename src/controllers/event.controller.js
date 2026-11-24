// Controller dos eventos (tela Relatórios): quedas, picos de latência e perda de pacotes.
import { DAY_MS } from '../lib/time.js';
import * as eventModel from '../models/event.model.js';

/** GET /api/events?type=todos|downtime|latencia|perda&period=0|7|30|all&device=<id> */
export function list(req, res) {
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
