// Schemas das rotas de usuários: POST /api/users e PATCH /api/users/:id.
// Nome, e-mail e senha seguem exatamente as regras do cadastro público.
import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema } from './auth.validators.js';

const roleSchema = z.enum(['admin', 'viewer'], { error: 'O perfil deve ser admin ou viewer.' });

export const userCreateSchema = z.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: roleSchema.default('viewer'),
});

export const userUpdateSchema = z
    .object({
        name: nameSchema.optional(),
        email: emailSchema.optional(),
        role: roleSchema.optional(),
        password: passwordSchema.optional(),
    })
    // sem path: o erro sai com field 'body' (vale para o corpo inteiro)
    .refine((body) => Object.values(body).some((value) => value !== undefined), { message: 'Informe ao menos um campo para alterar.' });
