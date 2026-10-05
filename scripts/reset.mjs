/**
 * scripts/reset.mjs
 * ------------------------------------------------------------------
 * npm run reset  ->  restaura o db.json a partir do db.seed.json.
 *
 * Além de copiar, DESLOCA todas as datas do seed (timestamp e
 * resolvido_em) para que o evento mais recente aconteça "agora - 2 min".
 * Assim os filtros "Últimas 24 horas" e "Últimos 7 dias" da tela de
 * Relatórios sempre têm dados na demonstração, mesmo meses depois de o
 * seed ter sido escrito. O db.seed.json em si nunca é alterado.
 * ------------------------------------------------------------------
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arquivoSeed = path.join(raiz, 'db.seed.json');
const arquivoDb = path.join(raiz, 'db.json');

const MARGEM_MS = 2 * 60 * 1000;
const CAMPOS_DE_DATA = { alertas: ['timestamp', 'resolvido_em'], logs: ['timestamp'] };

const seed = JSON.parse(readFileSync(arquivoSeed, 'utf8'));

const datas = Object.entries(CAMPOS_DE_DATA)
    .flatMap(([colecao, campos]) => (seed[colecao] || []).flatMap((item) => campos.map((campo) => item[campo])))
    .filter(Boolean)
    .map((valor) => new Date(valor).getTime());

const maisRecente = Math.max(...datas);
const deslocamento = Date.now() - MARGEM_MS - maisRecente;

for (const [colecao, campos] of Object.entries(CAMPOS_DE_DATA)) {
    for (const item of seed[colecao] || []) {
        for (const campo of campos) {
            if (item[campo]) {
                item[campo] = new Date(new Date(item[campo]).getTime() + deslocamento).toISOString();
            }
        }
    }
}

writeFileSync(arquivoDb, JSON.stringify(seed, null, 2) + '\n', 'utf8');
console.log(`db.json restaurado a partir de db.seed.json (datas deslocadas em ${(deslocamento / 86400000).toFixed(1)} dias).`);
