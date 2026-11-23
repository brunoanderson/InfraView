// Schemas reaproveitados por várias rotas.
import { z } from 'zod';

/** Id numérico positivo vindo da URL (/devices/:id). "abc" ou "-1" -> 400. */
export const idParamSchema = z.object({
    id: z.coerce.number({ error: 'O id precisa ser um número.' }).int().positive('O id precisa ser um número positivo.'),
});
