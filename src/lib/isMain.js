// Diz se o arquivo foi executado direto (node db/migrate.js) ou só importado
// por outro (pelo seed, pelo reset ou pelos testes). Uso:
//     if (isMain(import.meta.url)) { ... }
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isMain(moduleUrl) {
    return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(moduleUrl);
}
