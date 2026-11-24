// =============================================================================
// Validação de dispositivos (cadastro e edição) e dos filtros da listagem.
//
// O cliente só envia CONFIGURAÇÃO. status, latência, perda, contagem de falhas e
// datas são medidos pelo monitor: se vierem no corpo, o z.object os descarta.
// =============================================================================
import { isIP } from 'node:net';
import { z } from 'zod';

// Nome de host: partes de letras/números/hífen separadas por ponto (ex.: roteador.lan).
// Cada parte começa e termina com letra ou número, então nunca começa com "-".
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

// Portas que o fetch do Node recusa por segurança (lista conferida neste Node:
// 82 portas, ex.: 22 SSH, 25 SMTP, 554 RTSP). Para elas, só a verificação tcp funciona.
const FETCH_BLOCKED_PORTS = new Set([
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
    103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
    512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
    995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
    6669, 6679, 6697, 10080,
]);

const host = z
    .string({ error: 'Informe o host (IP ou nome).' })
    .trim()
    .min(1, 'Informe o host (IP ou nome).')
    .max(253, 'Host longo demais.')
    // abort: para no primeiro problema, para mostrar uma mensagem só
    .refine((h) => !/\s/.test(h), { message: 'O host não pode ter espaços.', abort: true })
    .refine((h) => !h.startsWith('-'), { message: 'O host não pode começar com "-".', abort: true })
    .refine((h) => isIP(h) !== 0 || HOSTNAME_RE.test(h), {
        message: 'Informe um IP (ex.: 192.168.0.10) ou nome de host válido (ex.: roteador.lan).',
    });

const optionalText = (max) =>
    z
        .string()
        .trim()
        .max(max, `Use no máximo ${max} caracteres.`)
        .nullish()
        .transform((v) => (v ? v : null)); // "" vira null

export const deviceBodySchema = z
    .object({
        name: z
            .string({ error: 'Informe o nome.' })
            .trim()
            .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
            .max(60, 'O nome pode ter no máximo 60 caracteres.'),
        model: optionalText(100),
        host,
        checkType: z.enum(['ping', 'tcp', 'http'], { error: 'Tipo de verificação deve ser ping, tcp ou http.' }).default('ping'),
        port: z
            .number({ error: 'A porta precisa ser um número.' })
            .int('A porta precisa ser um número inteiro.')
            .min(1, 'A porta vai de 1 a 65535.')
            .max(65535, 'A porta vai de 1 a 65535.')
            .nullish()
            .transform((v) => v ?? null),
        latencyThresholdMs: z
            .number({ error: 'O limite de latência precisa ser um número.' })
            .int()
            .min(1, 'O limite de latência precisa ser de pelo menos 1 ms.')
            .max(10_000, 'O limite de latência pode ser de no máximo 10000 ms.')
            .default(100),
        // % de tentativas sem resposta (nas últimas verificações) a partir da qual fica em atenção
        lossThresholdPct: z
            .number({ error: 'O limite de perda precisa ser um número.' })
            .int('O limite de perda precisa ser um número inteiro.')
            .min(1, 'O limite de perda vai de 1% a 100%.')
            .max(100, 'O limite de perda vai de 1% a 100%.')
            .default(20),
        categoryId: z.number({ error: 'Escolha a categoria.' }).int().positive('Escolha a categoria.'),
        isGateway: z.boolean({ error: 'Gateway deve ser verdadeiro ou falso.' }).default(false),
        icon: z
            .string()
            .regex(/^bi-[a-z0-9-]+$/, 'Ícone inválido (use uma classe do Bootstrap Icons, ex.: bi-router).')
            .default('bi-hdd'),
        monitoringEnabled: z.boolean({ error: 'Monitorar deve ser verdadeiro ou falso.' }).default(true),
    })
    // Regras que envolvem mais de um campo
    .superRefine((d, ctx) => {
        if (d.checkType === 'ping' && d.port !== null) {
            ctx.addIssue({ code: 'custom', path: ['port'], message: 'A verificação por ping não usa porta. Deixe a porta vazia.' });
        }
        if (d.checkType !== 'ping' && d.port === null) {
            ctx.addIssue({ code: 'custom', path: ['port'], message: `Informe a porta para a verificação ${d.checkType}.` });
        }
        if (d.checkType === 'http' && FETCH_BLOCKED_PORTS.has(d.port)) {
            ctx.addIssue({
                code: 'custom',
                path: ['port'],
                message: `A porta ${d.port} não é permitida para verificação http. Use a verificação tcp.`,
            });
        }
    });

/** Filtros de GET /api/devices */
export const deviceQuerySchema = z.object({
    status: z.enum(['online', 'offline', 'atencao', 'pendente'], { error: 'Status inválido.' }).optional(),
    search: z.string().trim().max(100).optional(),
    categoryId: z.coerce.number().int().positive('Categoria inválida.').optional(),
});
