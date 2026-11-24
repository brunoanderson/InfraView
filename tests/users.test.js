// =============================================================================
// Testes da gestão de usuários (GET/PATCH/DELETE /api/users, só admin).
// Banco :memory: próprio deste arquivo, com o admin do seed e usuários criados
// pelo cadastro público.
// Rodar: npm test
// =============================================================================
import './helpers/env.js'; // primeiro: define o ambiente de teste
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import request from 'supertest';

const { openDb, getDb } = await import('../src/lib/db.js');
const { migrate } = await import('../db/migrate.js');
const { seed } = await import('../db/seed.js');
const { createApp } = await import('../src/app.js');

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const register = (name, email) => request(app).post('/api/auth/register').send({ name, email, password: 'Senha123' });

let admin; // { id, token } do admin do seed
let viewer; // { id, token } de um viewer

before(async () => {
    const db = openDb({ create: true });
    migrate(db, { log: () => {} });
    await seed(db, { name: 'Admin', email: 'admin@teste.local', password: 'Senha123' });

    const adminLogin = await login('admin@teste.local', 'Senha123');
    admin = { id: adminLogin.body.user.id, token: adminLogin.body.token };
    const viewerRes = await register('Viewer', 'viewer@teste.local');
    viewer = { id: viewerRes.body.user.id, token: viewerRes.body.token };
});

describe('acesso às rotas de usuários', () => {
    test('sem token -> 401; viewer -> 403 em todas', async () => {
        assert.equal((await request(app).get('/api/users')).status, 401);
        const asViewer = [
            request(app).get('/api/users'),
            request(app).patch(`/api/users/${admin.id}`).send({ role: 'viewer' }),
            request(app).delete(`/api/users/${admin.id}`),
        ];
        for (const req of asViewer) assert.equal((await req.set(auth(viewer.token))).status, 403);
    });

    test('listagem traz os campos públicos e nunca o hash', async () => {
        const res = await request(app).get('/api/users').set(auth(admin.token));
        assert.equal(res.status, 200);
        assert.ok(res.body.users.length >= 2);
        for (const user of res.body.users) {
            assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'email', 'id', 'name', 'role']);
        }
        assert.doesNotMatch(JSON.stringify(res.body), /password|hash|\$2[aby]\$/i);
    });
});

describe('regras do último admin e da própria conta', () => {
    test('único admin não pode se rebaixar nem se excluir -> 409', async () => {
        const demote = await request(app).patch(`/api/users/${admin.id}`).set(auth(admin.token)).send({ role: 'viewer' });
        assert.equal(demote.status, 409);
        assert.match(demote.body.error.message, /único administrador/);
        const remove = await request(app).delete(`/api/users/${admin.id}`).set(auth(admin.token));
        assert.equal(remove.status, 409);
        assert.match(remove.body.error.message, /único administrador/);
    });

    test('com outro admin, ainda não pode rebaixar nem excluir a si mesmo -> 409', async () => {
        const other = await register('Segundo Admin', 'admin2@teste.local');
        await request(app).patch(`/api/users/${other.body.user.id}`).set(auth(admin.token)).send({ role: 'admin' });

        const demote = await request(app).patch(`/api/users/${admin.id}`).set(auth(admin.token)).send({ role: 'viewer' });
        assert.equal(demote.status, 409);
        assert.match(demote.body.error.message, /própria conta/);
        const remove = await request(app).delete(`/api/users/${admin.id}`).set(auth(admin.token));
        assert.equal(remove.status, 409);
        assert.match(remove.body.error.message, /própria conta/);
    });
});

describe('alterar perfil, redefinir senha e excluir', () => {
    test('promover e rebaixar valem na hora, com o mesmo token', async () => {
        const promote = await request(app).patch(`/api/users/${viewer.id}`).set(auth(admin.token)).send({ role: 'admin' });
        assert.equal(promote.status, 200);
        assert.equal(promote.body.user.role, 'admin');
        assert.equal((await request(app).get('/api/users').set(auth(viewer.token))).status, 200); // token antigo, perfil novo

        const demote = await request(app).patch(`/api/users/${viewer.id}`).set(auth(admin.token)).send({ role: 'viewer' });
        assert.equal(demote.body.user.role, 'viewer');
        assert.equal((await request(app).get('/api/users').set(auth(viewer.token))).status, 403);
    });

    test('redefinir senha: entra com a nova, não com a antiga', async () => {
        const res = await request(app).patch(`/api/users/${viewer.id}`).set(auth(admin.token)).send({ password: 'NovaSenha9' });
        assert.equal(res.status, 200);
        assert.equal((await login('viewer@teste.local', 'NovaSenha9')).status, 200);
        assert.equal((await login('viewer@teste.local', 'Senha123')).status, 401);
    });

    test('corpo inválido -> 400 com o campo', async () => {
        const cases = [
            [{}, 'body'], // nenhum campo
            [{ role: 'root' }, 'role'],
            [{ password: 'curta1' }, 'password'],
            [{ password: 'semnumero' }, 'password'],
        ];
        for (const [body, field] of cases) {
            const res = await request(app).patch(`/api/users/${viewer.id}`).set(auth(admin.token)).send(body);
            assert.equal(res.status, 400, JSON.stringify(body));
            assert.ok(res.body.error.details.some((d) => d.field === field), `esperava erro em ${field} para ${JSON.stringify(body)}`);
        }
        assert.equal((await request(app).patch('/api/users/abc').set(auth(admin.token)).send({ role: 'admin' })).status, 400);
    });

    test('id inexistente -> 404', async () => {
        assert.equal((await request(app).patch('/api/users/9999').set(auth(admin.token)).send({ role: 'admin' })).status, 404);
        assert.equal((await request(app).delete('/api/users/9999').set(auth(admin.token))).status, 404);
    });

    test('excluir: 204, some da lista, o token antigo dá 401 e o alerta reconhecido fica sem autor', async () => {
        // um alerta reconhecido pelo usuário que vai ser excluído
        const db = getDb();
        const deviceId = db.prepare(`INSERT INTO devices (name, host, check_type, category_id) VALUES ('ALVO', '10.0.0.1', 'ping', 1)`).run().lastInsertRowid;
        const alertId = db.prepare(
            `INSERT INTO alerts (device_id, kind, severity, status, title, acknowledged_at, acknowledged_by)
             VALUES (?, 'offline', 'critical', 'ativo', 'ALVO está offline', ?, ?)`,
        ).run(deviceId, new Date().toISOString(), viewer.id).lastInsertRowid;

        assert.equal((await request(app).delete(`/api/users/${viewer.id}`).set(auth(admin.token))).status, 204);

        const list = await request(app).get('/api/users').set(auth(admin.token));
        assert.ok(!list.body.users.some((u) => u.id === viewer.id));
        const old = await request(app).get('/api/devices').set(auth(viewer.token));
        assert.equal(old.status, 401);

        const { alerts } = (await request(app).get('/api/alerts').set(auth(admin.token))).body;
        const alert = alerts.find((a) => a.id === Number(alertId));
        assert.ok(alert.acknowledgedAt, 'o reconhecimento continua registrado');
        assert.equal(alert.acknowledgedBy, null);
    });
});
