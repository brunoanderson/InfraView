// =============================================================================
// Schemas zod das rotas de autenticação.
// z.object descarta campos desconhecidos: se alguém enviar "role": "admin" no
// cadastro, o campo é simplesmente ignorado e a conta nasce como viewer.
// =============================================================================
import { z } from 'zod';

const email = z
    .string({ error: 'Informe o e-mail.' })
    .trim()
    .toLowerCase()
    .max(254, 'E-mail longo demais.')
    .pipe(z.email('Informe um e-mail válido.'));

export const registerSchema = z.object({
    name: z
        .string({ error: 'Informe o nome.' })
        .trim()
        .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
        .max(100, 'O nome pode ter no máximo 100 caracteres.'),
    email,
    password: z
        .string({ error: 'Informe a senha.' })
        .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
        // o bcrypt considera só os primeiros 72 bytes da senha
        .max(72, 'A senha pode ter no máximo 72 caracteres.')
        .regex(/[A-Za-z]/, 'A senha precisa ter pelo menos uma letra.')
        .regex(/\d/, 'A senha precisa ter pelo menos um número.'),
});

export const loginSchema = z.object({
    email,
    password: z.string({ error: 'Informe a senha.' }).min(1, 'Informe a senha.').max(72),
});
