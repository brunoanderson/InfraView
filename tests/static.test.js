// =============================================================================
// Testes do front servido pelo Express (pasta public/).
// Conferem que as páginas e os scripts saem com o tipo certo, que o cabeçalho
// de segurança (CSP) está presente e que nenhum HTML tem código inline, que a
// CSP bloquearia no navegador.
// Rodar: npm test
// =============================================================================
import './helpers/env.js'; // primeiro: define o ambiente de teste
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import request from 'supertest';

const { createApp } = await import('../src/app.js');
const { ROOT_DIR } = await import('../src/config/env.js');

const app = createApp();
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const htmlFiles = fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html'));

describe('arquivos do front', () => {
    test('páginas HTML são servidas como text/html', async () => {
        for (const page of ['/login.html', '/cadastro.html', '/dashboard.html', '/rede.html', '/alertas.html', '/relatorios.html']) {
            const res = await request(app).get(page);
            assert.equal(res.status, 200, page);
            assert.match(res.headers['content-type'], /^text\/html/, page);
        }
    });

    test('"/" serve o index.html, que redireciona para o login ou o dashboard', async () => {
        const res = await request(app).get('/');
        assert.equal(res.status, 200);
        assert.match(res.text, /js\/index\.js/);
    });

    test('scripts de public/js saem como JavaScript e o CSS como text/css', async () => {
        for (const file of fs.readdirSync(path.join(PUBLIC_DIR, 'js'))) {
            const res = await request(app).get(`/js/${file}`);
            assert.equal(res.status, 200, file);
            assert.match(res.headers['content-type'], /javascript/, file);
        }
        const css = await request(app).get('/css/style.css');
        assert.equal(css.status, 200);
        assert.match(css.headers['content-type'], /^text\/css/);
    });

    test('o cabeçalho Content-Security-Policy está presente e não libera código inline', async () => {
        const res = await request(app).get('/login.html');
        const csp = res.headers['content-security-policy'];
        assert.ok(csp, 'faltou o cabeçalho Content-Security-Policy');
        assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
        assert.match(csp, /script-src-attr 'none'/); // bloqueia onclick="..."
        assert.doesNotMatch(csp, /unsafe-inline/);
    });

    test('nenhum HTML tem <script> inline, onclick="..." ou style="..." (a CSP bloquearia)', () => {
        assert.ok(htmlFiles.length >= 7, 'esperava as 7 páginas em public/');
        for (const file of htmlFiles) {
            const html = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
            assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${file}: <script> sem src`);
            assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${file}: atributo on...=`);
            assert.doesNotMatch(html, /\sstyle\s*=/i, `${file}: atributo style=`);
        }
    });

    test('rota inexistente fora de /api continua dando 404', async () => {
        const res = await request(app).get('/nao-existe.html');
        assert.equal(res.status, 404);
    });
});
