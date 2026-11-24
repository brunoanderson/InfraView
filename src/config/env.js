// =============================================================================
// Configuração: lê o .env e valida as variáveis de ambiente com zod.
//
// Se alguma variável obrigatória faltar ou for inválida, o processo para aqui,
// antes de abrir o banco ou subir o servidor ("fail fast"). A mensagem de erro
// mostra só o NOME da variável e o problema, nunca o valor (o segredo do JWT
// não pode aparecer em log).
// =============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Raiz do projeto (duas pastas acima de src/config). */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Variáveis já definidas no ambiente (ex.: pelos testes) têm prioridade sobre o .env.
dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

// Mensagem para variável obrigatória que não foi definida (sem isto, o zod responde em inglês).
const MISSING = 'variável obrigatória não definida';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test'], { error: 'use development, production ou test' }).default('development'),
    PORT: z.coerce
        .number({ error: 'precisa ser um número' })
        .int()
        .min(1)
        .max(65535, 'precisa estar entre 1 e 65535')
        .default(3000),
    DATABASE_URL: z.string({ error: MISSING }).trim().min(1, 'informe o caminho do arquivo SQLite'),
    JWT_SECRET: z.string({ error: MISSING }).min(32, 'precisa ter pelo menos 32 caracteres'),
    // Formato aceito pelo jsonwebtoken: número + unidade (30m, 8h, 7d)
    JWT_EXPIRES_IN: z
        .string()
        .trim()
        .regex(/^\d+\s*(s|m|h|d|w)$/, 'use número + unidade, ex.: 30m, 8h, 7d')
        .default('8h'),
    // "http://a,http://b" -> ['http://a', 'http://b']
    CORS_ORIGIN: z
        .string({ error: MISSING })
        .trim()
        .min(1, 'informe ao menos uma origem')
        .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),

    // ---- Monitoramento ----
    // z.stringbool aceita "true"/"false" (z.coerce.boolean("false") daria true!)
    MONITOR_ENABLED: z.stringbool().default(true),
    MONITOR_INTERVAL_SECONDS: z.coerce.number({ error: 'precisa ser um número' }).int().min(5).max(3600).default(30),
    MONITOR_TIMEOUT_MS: z.coerce.number({ error: 'precisa ser um número' }).int().min(200).max(10_000).default(2000),
    // quantas falhas SEGUIDAS até considerar o dispositivo offline (evita alarme falso)
    MONITOR_FAILURE_THRESHOLD: z.coerce.number({ error: 'precisa ser um número' }).int().min(1).max(10).default(3),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('\n[config] Variáveis de ambiente inválidas ou ausentes:');
    for (const issue of parsed.error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    console.error('\nCopie .env.example para .env e preencha os valores.\n');
    process.exit(1);
}

/** Configuração validada e tipada. Congelada para ninguém alterar em tempo de execução. */
export const env = Object.freeze({
    ...parsed.data,
    isTest: parsed.data.NODE_ENV === 'test',
});
