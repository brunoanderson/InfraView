// =============================================================================
// Schemas zod das rotas de autenticação.
// z.object descarta campos desconhecidos: se alguém enviar "role": "admin" no
// cadastro, o campo é simplesmente ignorado e a conta nasce como viewer.
// =============================================================================
import { z } from 'zod';

/** Nome e e-mail do cadastro (também usados quando o super admin cria ou edita uma conta). */
export const nameSchema = z
    .string({ error: 'Informe o nome.' })
    .trim()
    .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
    .max(100, 'O nome pode ter no máximo 100 caracteres.');

export const emailSchema = z
    .string({ error: 'Informe o e-mail.' })
    .trim()
    .toLowerCase()
    .max(254, 'E-mail longo demais.')
    .pipe(z.email('Informe um e-mail válido.'));

/** Regra de senha do cadastro (também usada quando o super admin cria uma conta ou redefine uma senha). */
export const passwordSchema = z
    .string({ error: 'Informe a senha.' })
    .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
    // o bcrypt considera só os primeiros 72 bytes da senha
    .max(72, 'A senha pode ter no máximo 72 caracteres.')
    .regex(/[A-Za-z]/, 'A senha precisa ter pelo menos uma letra.')
    .regex(/\d/, 'A senha precisa ter pelo menos um número.');

export const registerSchema = z.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
});

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string({ error: 'Informe a senha.' }).min(1, 'Informe a senha.').max(72),
});
