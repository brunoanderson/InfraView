// Schema de PATCH /api/users/:id: perfil e/ou nova senha (pelo menos um dos dois).
import { z } from 'zod';
import { passwordSchema } from './auth.validators.js';

export const userUpdateSchema = z
    .object({
        role: z.enum(['admin', 'viewer'], { error: 'O perfil deve ser admin ou viewer.' }).optional(),
        password: passwordSchema.optional(),
    })
    // sem path: o erro sai com field 'body' (vale para o corpo inteiro)
    .refine((body) => body.role !== undefined || body.password !== undefined, { message: 'Informe o perfil, a nova senha ou os dois.' });
