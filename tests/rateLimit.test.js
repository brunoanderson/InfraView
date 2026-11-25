// =============================================================================
// Testes do limite de tentativas (middlewares/rateLimit.js).
//  * a fábrica createAuthLimiter, num app mínimo com limite pequeno;
//  * a ligação real nas rotas, com o limite de teste (1000): o cadastro conta
//    toda requisição e tem contador próprio, separado do login.
// Rodar: npm test
// =============================================================================
import './helpers/env.js'; // primeiro: define o ambiente de teste
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import express from 'express';
import request from 'supertest';

const { openDb } = await import('../src/lib/db.js');
const { migrate } = await import('../db/migrate.js');
const { seed } = await import('../db/seed.js');
const { createApp } = await import('../src/app.js');
const { createAuthLimiter } = await import('../src/middlewares/rateLimit.js');

/** App mínimo: POST /entrar responde 200 com a senha certa e 401 com a errada. */
function loginApp(limiterOptions) {
    const app = express();
    app.use(express.json());
    app.post('/entrar', createAuthLimiter(limiterOptions), (req, res) => {
        if (req.body.password === 'certa') return res.json({ ok: true });
        res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' } });
    });
    return app;
}
const entrar = (app, password) => request(app).post('/entrar').send({ password });

describe('createAuthLimiter', () => {
    test('depois de N falhas a resposta é 429 TOO_MANY_REQUESTS no formato padrão', async () => {
        const app = loginApp({ limit: 3, skipSuccessfulRequests: true });
        for (let i = 0; i < 3; i++) assert.equal((await entrar(app, 'errada')).status, 401);

        const blocked = await entrar(app, 'errada');
        assert.equal(blocked.status, 429);
        assert.deepEqual(Object.keys(blocked.body), ['error']);
        assert.equal(blocked.body.error.code, 'TOO_MANY_REQUESTS');
        assert.match(blocked.body.error.message, /Aguarde 15 minutos/);
        assert.ok(blocked.headers.ratelimit, 'informa o que resta pelo cabeçalho RateLimit');
    });

    test('login correto não consome o limite (skipSuccessfulRequests)', async () => {
        const app = loginApp({ limit: 3, skipSuccessfulRequests: true });
        for (let i = 0; i < 10; i++) assert.equal((await entrar(app, 'certa')).status, 200);
        for (let i = 0; i < 3; i++) assert.equal((await entrar(app, 'errada')).status, 401);
        assert.equal((await entrar(app, 'errada')).status, 429);
    });

    test('sem skipSuccessfulRequests, o acerto também conta (cadastro)', async () => {
        const app = loginApp({ limit: 3 });
        for (let i = 0; i < 3; i++) assert.equal((await entrar(app, 'certa')).status, 200);
        assert.equal((await entrar(app, 'certa')).status, 429);
    });

    test('cada limitador tem o seu contador', async () => {
        const app = loginApp({ limit: 1 });
        const other = loginApp({ limit: 1 });
        assert.equal((await entrar(app, 'certa')).status, 200);
        assert.equal((await entrar(app, 'certa')).status, 429);
        assert.equal((await entrar(other, 'certa')).status, 200);
    });
});

describe('limites nas rotas reais', () => {
    test('o cadastro conta toda requisição (também as inválidas) e não bloqueia o login', async () => {
        const db = openDb({ create: true });
        migrate(db, { log: () => {} });
        await seed(db, { name: 'Raiz', email: 'raiz@teste.local', password: 'Senha123' });
        const app = createApp();

        // corpo inválido: 400 sem passar pelo bcrypt, então as 1000 requisições são rápidas
        for (let i = 0; i < 1000; i++) {
            const res = await request(app).post('/api/auth/register').send({});
            assert.equal(res.status, 400);
        }
        const blocked = await request(app).post('/api/auth/register').send({ name: 'Fulano', email: 'fulano@teste.local', password: 'Senha123' });
        assert.equal(blocked.status, 429);
        assert.equal(blocked.body.error.code, 'TOO_MANY_REQUESTS');

        const login = await request(app).post('/api/auth/login').send({ email: 'raiz@teste.local', password: 'Senha123' });
        assert.equal(login.status, 200, 'o contador do login é outro');
    });
});
