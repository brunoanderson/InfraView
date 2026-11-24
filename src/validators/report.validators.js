// Filtros de GET /api/events e GET /api/alerts.
import { z } from 'zod';

export const eventQuerySchema = z.object({
    type: z.enum(['todos', 'downtime', 'latencia', 'perda'], { error: 'Tipo deve ser todos, downtime, latencia ou perda.' }).default('todos'),
    // 0 = últimas 24 horas; 7 e 30 dias; all = tudo
    period: z.enum(['0', '7', '30', 'all'], { error: 'Período deve ser 0, 7, 30 ou all.' }).default('7'),
    device: z.coerce.number({ error: 'Dispositivo inválido.' }).int().positive('Dispositivo inválido.').optional(),
});

export const alertQuerySchema = z.object({
    status: z.enum(['ativo', 'resolvido', 'info'], { error: 'Status deve ser ativo, resolvido ou info.' }).optional(),
    severity: z.enum(['critical', 'warning', 'info'], { error: 'Severidade deve ser critical, warning ou info.' }).optional(),
    kind: z.enum(['offline', 'latency', 'loss'], { error: 'Tipo de alerta deve ser offline, latency ou loss.' }).optional(),
});
