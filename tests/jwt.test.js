// =============================================================================
// Testes do token JWT (lib/jwt.js e middlewares/auth.js). Rodar: npm test
// =============================================================================
import './helpers/env.js'; // primeiro: define o ambiente de teste
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const { openDb } = await import('../src/lib/db.js');
const { migrate } = await import('../db/migrate.js');
const { seed } = await import('../db/seed.js');
const { signToken, verifyToken } = await import('../src/lib/jwt.js');
const { createApp } = await import('../src/app.js');

const app = createApp();
const SECRET = process.env.JWT_SECRET;
const b64 = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
const me = (token) => request(app).get('/api/auth/me').set({ Authorization: `Bearer ${token}` });

let root; // { id, token }

before(async () => {
    const db = openDb({ create: true });
    migrate(db, { log: () => {} });
    await seed(db, { name: 'Raiz', email: 'raiz@teste.local', password: 'Senha123' });
    const login = await request(app).post('/api/auth/login').send({ email: 'raiz@teste.local', password: 'Senha123' });
    root = { id: login.body.user.id, token: login.body.token };
});

describe('conteúdo do token', () => {
    test('leva só o id do usuário (sub) e as datas; o perfil não vai no token', () => {
        const token = signToken({ id: 7, role: 'superadmin' });
        const payload = verifyToken(token);
        assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'sub']);
        assert.equal(payload.sub, '7');
        assert.equal(jwt.decode(token, { complete: true }).header.alg, 'HS256');
    });
});

describe('tokens recusados (401)', () => {
    /** 401 no formato padrão, com o código esperado e sem detalhe interno. */
    function assertRejected(res, code) {
        assert.equal(res.status, 401);
        assert.equal(res.body.error.code, code);
        assert.deepEqual(Object.keys(res.body.error).sort(), ['code', 'message']);
    }

    test('o token válido da raiz funciona (controle dos testes abaixo)', async () => {
        assert.equal((await me(root.token)).status, 200);
    });

    test('alg=none (sem assinatura) -> 401 INVALID_TOKEN', async () => {
        const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: String(root.id) })}.`;
        assertRejected(await me(forged), 'INVALID_TOKEN');
    });

    test('payload adulterado com a assinatura antiga -> 401 INVALID_TOKEN', async () => {
        const viewer = await request(app).post('/api/auth/register').send({ name: 'Viewer', email: 'viewer@teste.local', password: 'Senha123' });
        const [header, payload, signature] = viewer.body.token.split('.');
        const original = JSON.parse(Buffer.from(payload, 'base64url').toString());
        assert.notEqual(original.sub, String(root.id));

        const tampered = `${header}.${b64({ ...original, sub: String(root.id) })}.${signature}`;
        assertRejected(await me(tampered), 'INVALID_TOKEN');
    });

    test('token expirado -> 401 TOKEN_EXPIRED', async () => {
        const expired = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 }, SECRET, { subject: String(root.id), algorithm: 'HS256' });
        assertRejected(await me(expired), 'TOKEN_EXPIRED');
    });

    test('assinado com outro segredo, ou com outro algoritmo (HS512), -> 401 INVALID_TOKEN', async () => {
        const otherSecret = jwt.sign({}, 'outro-segredo-qualquer-com-mais-de-32-caracteres', { subject: String(root.id), expiresIn: '1h' });
        assertRejected(await me(otherSecret), 'INVALID_TOKEN');
        const otherAlgorithm = jwt.sign({}, SECRET, { subject: String(root.id), expiresIn: '1h', algorithm: 'HS512' });
        assertRejected(await me(otherAlgorithm), 'INVALID_TOKEN');
    });

    test('token de um usuário que não existe mais -> 401', async () => {
        const ghost = jwt.sign({}, SECRET, { subject: '999999', expiresIn: '1h', algorithm: 'HS256' });
        assert.equal((await me(ghost)).status, 401);
    });
});
