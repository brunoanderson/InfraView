// Mesmo em NODE_ENV=development (o do .env.example), a resposta de erro nunca
// traz o stack trace nem detalhes internos: eles ficam só no log do servidor.
// Rodar: npm test
import './helpers/env.js'; // define o ambiente de teste...
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'development'; // ...e aqui troca para desenvolvimento, antes de carregar o código

const { closeDb, openDb } = await import('../src/lib/db.js');
const { migrate } = await import('../db/migrate.js');
const { createApp } = await import('../src/app.js');
const { errorHandler } = await import('../src/middlewares/errorHandler.js');
const { env } = await import('../src/config/env.js');

test('o ambiente deste teste é development', () => {
    assert.equal(env.NODE_ENV, 'development');
});

test('500 inesperado: mensagem genérica, sem stack e sem a mensagem interna', async () => {
    const logged = [];
    const originalError = console.error;
    console.error = (...args) => logged.push(args); // o log do servidor continua recebendo o erro
    try {
        const probe = express();
        probe.get('/boom', () => { throw new Error('detalhe interno: tabela secreta'); });
        probe.use(errorHandler);
        const res = await request(probe).get('/boom');

        assert.equal(res.status, 500);
        assert.deepEqual(Object.keys(res.body.error).sort(), ['code', 'message']);
        assert.equal(res.body.error.code, 'INTERNAL_ERROR');
        assert.doesNotMatch(JSON.stringify(res.body), /tabela secreta|at .*\.js/);
        assert.match(String(logged[0]?.[1]?.stack), /tabela secreta/, 'o stack precisa continuar no log');
    } finally {
        console.error = originalError;
    }
});

test('503 vindo do SQLite: sem stack na resposta', async () => {
    migrate(openDb({ create: true }), { log: () => {} });
    closeDb(); // a próxima requisição abre um banco vazio (sem tabelas)
    const originalError = console.error;
    console.error = () => {};
    try {
        const res = await request(createApp()).post('/api/auth/login').send({ email: 'a@b.com', password: 'x' });
        assert.equal(res.status, 503);
        assert.deepEqual(Object.keys(res.body.error).sort(), ['code', 'message']);
    } finally {
        console.error = originalError;
        closeDb();
    }
});
