// =============================================================================
// Validação de entrada com zod.
//
// Uso numa rota:
//     router.post('/devices', validate({ body: deviceSchema }), controller.create)
//
// Cada parte (body, query, params) é conferida contra o seu schema. Se algo
// estiver errado, a requisição para aqui com 400 e a lista de erros por campo:
//     { "error": { "code": "VALIDATION_ERROR", "details": [ { "field": "host", "message": "..." } ] } }
// Se estiver tudo certo, o controller recebe os dados JÁ convertidos e limpos
// (campos desconhecidos removidos, textos com trim, números convertidos) em
// req.validated. (No Express 5, req.query é só leitura, por isso não é sobrescrito.)
// =============================================================================
import { AppError } from '../errors/AppError.js';

const PARTS = ['params', 'query', 'body'];

export function validate(schemas) {
    return (req, res, next) => {
        const validated = {};
        const details = [];

        for (const part of PARTS) {
            const schema = schemas[part];
            if (!schema) continue;

            // Corpo ausente (sem Content-Type JSON) é tratado como objeto vazio.
            const input = part === 'body' ? (req.body ?? {}) : req[part];
            const result = schema.safeParse(input);

            if (result.success) {
                validated[part] = result.data;
            } else {
                for (const issue of result.error.issues) {
                    details.push({
                        field: issue.path.length ? issue.path.join('.') : part,
                        message: issue.message,
                    });
                }
            }
        }

        if (details.length) return next(AppError.validation(details));

        req.validated = validated;
        next();
    };
}
