// =============================================================================
// Testes do tratamento centralizado de erros (middlewares/errorHandler.js):
// cada erro vira o código HTTP certo, no formato { error: { code, message } },
// sem mostrar detalhes internos (mensagens do SQLite, stack).
// Os erros de banco são REAIS (vêm do SQLite em memória), não simulados.
// Rodar: npm test
// =============================================================================
import './helpers/env.js'; // primeiro: define o ambiente de teste
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import express from 'express';
import request from 'supertest';

const { closeDb, openDb } = await import('../src/lib/db.js');
const { migrate } = await import('../db/migrate.js');
const { createApp } = await import('../src/app.js');
const { errorHandler } = await import('../src/middlewares/errorHandler.js');
const deviceModel = await import('../src/models/device.model.js');

const app = createApp();
let token;

/** Nada de detalhe interno na resposta. */
function assertClean(res) {
    assert.ok(res.body.error, 'resposta precisa ter { error }');
    assert.equal(typeof res.body.error.code, 'string');
    assert.equal(typeof res.body.error.message, 'string');
    assert.equal(res.body.error.stack, undefined);
    assert.doesNotMatch(JSON.stringify(res.body), /SQLITE|constraint|no such table|at .*\.js/i);
}

before(async () => {
    const db = openDb({ create: true });
    migrate(db, { log: () => {} });
    const res = await request(app).post('/api/auth/register').send({ name: 'Teste', email: 'erros@teste.local', password: 'Senha123' });
    token = res.body.token;
});

after(() => closeDb());

describe('erros convertidos em respostas HTTP', () => {
    test('JSON malformado -> 400 INVALID_JSON', async () => {
        const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
        assert.equal(res.status, 400);
        assert.equal(res.body.error.code, 'INVALID_JSON');
        assertClean(res);
    });

    test('corpo acima de 10 kB -> 413 PAYLOAD_TOO_LARGE', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'a'.repeat(20_000), password: 'x' });
        assert.equal(res.status, 413);
        assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
        assertClean(res);
    });

    test('rota inexistente -> 404 NOT_FOUND (na API, com token, e fora dela)', async () => {
        const api = await request(app).get('/api/nao-existe').set('Authorization', `Bearer ${token}`);
        assert.equal(api.status, 404);
        assert.equal(api.body.error.code, 'NOT_FOUND');
        assertClean(api);

        const page = await request(app).get('/nao-existe.html');
        assert.equal(page.status, 404);
        assert.equal(page.body.error.code, 'NOT_FOUND');
    });

    test('chave estrangeira (categoria inexistente) -> 409 CONFLICT sem a mensagem do SQLite', async () => {
        // Rota de teste que grava direto pelo model, sem a checagem do service:
        // assim o erro que chega ao errorHandler é o do próprio SQLite.
        const probe = express();
        probe.use(express.json());
        probe.post('/fk', (req) => {
            deviceModel.create({
                name: 'SEM-CATEGORIA', model: null, host: '10.0.0.1', checkType: 'ping', port: null,
                latencyThresholdMs: 100, lossThresholdPct: 20, isGateway: false, icon: 'bi-hdd',
                monitoringEnabled: true, categoryId: req.body.categoryId,
            });
        });
        probe.use(errorHandler);

        const res = await request(probe).post('/fk').send({ categoryId: 999 });
        assert.equal(res.status, 409);
        assert.equal(res.body.error.code, 'CONFLICT');
        assertClean(res);
    });
});

describe('banco fora do ar', () => {
    test('sem as tabelas (banco vazio) -> 503 DATABASE_UNAVAILABLE com a dica do db:reset', async () => {
        // Fecha o banco: a próxima requisição reabre um banco em memória VAZIO,
        // como se o arquivo existisse mas as migrations não tivessem rodado.
        closeDb();

        const health = await request(app).get('/api/health');
        assert.equal(health.status, 503);
        assert.equal(health.body.error.code, 'DATABASE_UNAVAILABLE');
        assert.match(health.body.error.message, /db:reset/);
        assertClean(health);

        const login = await request(app).post('/api/auth/login').send({ email: 'erros@teste.local', password: 'Senha123' });
        assert.equal(login.status, 503);
        assert.equal(login.body.error.code, 'DATABASE_UNAVAILABLE');
        assertClean(login);
    });
});
