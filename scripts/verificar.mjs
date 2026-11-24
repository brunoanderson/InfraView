// =============================================================================
// npm run verificar — roda o npm test e mostra só o resumo:
//   total, quantos passaram e quantos falharam.
// Se algum teste falhar, mostra a saída completa (para ver o motivo) e sai com
// código 1, então serve para conferir o projeto antes de um commit ou da entrega.
// =============================================================================
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Pelo "npm run", o npm informa onde está (npm_execpath): assim o npm test roda
// sem shell, também no Windows. Rodando o arquivo direto, chama o mesmo "node --test".
const npm = process.env.npm_execpath;
const args = npm && /\.[cm]?js$/.test(npm) ? [npm, 'test'] : ['--test'];

const started = Date.now();
const run = spawnSync(process.execPath, args, { cwd: ROOT_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
const seconds = ((Date.now() - started) / 1000).toFixed(1);

// Linhas finais do node --test: "ℹ tests 62" (relatório spec) ou "# tests 62" (relatório tap)
const count = (name) => {
    const match = new RegExp(`^(?:ℹ|#) ${name} (\\d+)\\s*$`, 'm').exec(output);
    return match ? Number(match[1]) : null;
};
const total = count('tests');
const passed = count('pass');
const failed = count('fail');

if (run.error || total === null || passed === null || failed === null) {
    console.log(output);
    console.error(`[verificar] Não foi possível ler o resultado dos testes${run.error ? `: ${run.error.message}` : '.'}`);
    process.exit(1);
}

const ok = failed === 0 && run.status === 0;
if (!ok) console.log(output);

console.log(`[verificar] Total: ${total} | Passaram: ${passed} | Falharam: ${failed} | ${seconds} s`);
console.log(ok ? '[verificar] OK: todos os testes passaram.' : '[verificar] FALHOU: veja os detalhes acima.');
process.exit(ok ? 0 : 1);
