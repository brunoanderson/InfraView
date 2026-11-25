// =============================================================================
// Testes da gestão de usuários (GET/POST/PATCH/DELETE /api/users, só super admin).
// Banco :memory: próprio deste arquivo. O seed cria a conta raiz; as demais
// contas são criadas pela própria API ou pelo cadastro público.
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
const PASSWORD = 'Senha123';
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const login = (email, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });
const register = (name, email) => request(app).post('/api/auth/register').send({ name, email, password: PASSWORD });
const patchAs = (actor, id, body) => request(app).patch(`/api/users/${id}`).set(auth(actor.token)).send(body);
const deleteAs = (actor, id) => request(app).delete(`/api/users/${id}`).set(auth(actor.token));
const listAs = async (actor) => (await request(app).get('/api/users').set(auth(actor.token))).body.users;

let root; // { id, token } da conta raiz criada pelo seed
let emailCount = 0;

/** Cria uma conta pela API (como a raiz) e devolve { id, email, token }. */
async function account(role, { as = root, password = PASSWORD } = {}) {
    const email = `${role}${++emailCount}@teste.local`;
    const res = await request(app).post('/api/users').set(auth(as.token)).send({ name: `Conta ${role}`, email, password, role });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return { id: res.body.user.id, email, token: (await login(email, password)).body.token };
}

before(async () => {
    const db = openDb({ create: true });
    migrate(db, { log: () => {} });
    await seed(db, { name: 'Raiz', email: 'raiz@teste.local', password: PASSWORD });
    const rootLogin = await login('raiz@teste.local');
    root = { id: rootLogin.body.user.id, token: rootLogin.body.token };
});

describe('acesso às rotas de usuários', () => {
    test('sem token -> 401; admin e viewer -> 403 em todas', async () => {
        assert.equal((await request(app).get('/api/users')).status, 401);
        assert.equal((await request(app).post('/api/users').send({})).status, 401);

        const admin = await account('admin');
        const viewer = { token: (await register('Viewer', 'viewer.acesso@teste.local')).body.token };
        const target = await account('viewer');
        for (const actor of [admin, viewer]) {
            const calls = [
                request(app).get('/api/users'),
                request(app).post('/api/users').send({ name: 'Outra', email: 'outra@teste.local', password: PASSWORD }),
                request(app).patch(`/api/users/${target.id}`).send({ name: 'Mudou' }),
                request(app).delete(`/api/users/${target.id}`),
            ];
            for (const call of calls) {
                const res = await call.set(auth(actor.token));
                assert.equal(res.status, 403);
                assert.equal(res.body.error.code, 'FORBIDDEN');
            }
        }
    });

    test('listagem traz os campos públicos com isRoot e nunca o hash', async () => {
        const users = await listAs(root);
        assert.ok(users.length >= 2);
        for (const user of users) {
            assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'email', 'id', 'isRoot', 'name', 'role']);
            assert.equal(user.isRoot, user.id === root.id);
        }
        assert.deepEqual(users[0], { ...users[0], id: root.id, role: 'superadmin', isRoot: true });
        assert.doesNotMatch(JSON.stringify(users), /password|hash|\$2[aby]\$/i);
    });
});

describe('criar usuários', () => {
    test('super admin cria superadmin, admin e viewer (padrão) -> 201, e as contas entram com a senha definida', async () => {
        for (const role of ['superadmin', 'admin', 'viewer']) {
            const email = `nova.${role}@teste.local`;
            const res = await request(app).post('/api/users').set(auth(root.token))
                .send({ name: `Nova ${role}`, email, password: 'Inicial123', ...(role === 'viewer' ? {} : { role }) });
            assert.equal(res.status, 201);
            assert.deepEqual(Object.keys(res.body.user).sort(), ['createdAt', 'email', 'id', 'isRoot', 'name', 'role']);
            assert.equal(res.body.user.role, role);
            assert.equal(res.body.user.isRoot, false);
            const entry = await login(email, 'Inicial123');
            assert.equal(entry.status, 200);
            assert.equal(entry.body.user.role, role);
        }
        const normalized = await request(app).post('/api/users').set(auth(root.token))
            .send({ name: 'Normalizada', email: '  Normalizada@Teste.Local ', password: 'Inicial123' });
        assert.equal(normalized.body.user.email, 'normalizada@teste.local'); // como no cadastro
    });

    test('um super admin criado também cria contas, inclusive super admin', async () => {
        const created = await account('superadmin');
        const other = await account('superadmin', { as: created });
        assert.ok(other.token);
    });

    test('isRoot e is_root enviados no corpo são ignorados: a conta nunca é raiz', async () => {
        const res = await request(app).post('/api/users').set(auth(root.token))
            .send({ name: 'Esperta', email: 'esperta@teste.local', password: 'Inicial123', role: 'superadmin', isRoot: true, is_root: 1 });
        assert.equal(res.status, 201);
        assert.equal(res.body.user.isRoot, false);
        const patch = await patchAs(root, res.body.user.id, { name: 'Esperta 2', isRoot: true });
        assert.equal(patch.status, 200);
        assert.equal(patch.body.user.isRoot, false);
        assert.equal((await listAs(root)).filter((u) => u.isRoot).length, 1);
    });

    test('e-mail repetido -> 409 igual ao do cadastro; dados inválidos -> 400 com o campo', async () => {
        const repeated = await request(app).post('/api/users').set(auth(root.token)).send({ name: 'Outra', email: 'RAIZ@teste.local', password: 'Inicial123' });
        const viaRegister = await register('Outra', 'raiz@teste.local');
        assert.equal(repeated.status, 409);
        assert.deepEqual(repeated.body, viaRegister.body);
        assert.deepEqual(repeated.body.error.details, { fields: ['email'] });

        const cases = [
            [{ name: 'Fulano', email: 'fulano@teste.local', password: 'semnumero' }, 'password'],
            [{ name: 'Fulano', email: 'fulano@teste.local', password: 'curta1' }, 'password'],
            [{ name: 'Fulano', email: 'não-é-email', password: 'Inicial123' }, 'email'],
            [{ name: 'F', email: 'fulano@teste.local', password: 'Inicial123' }, 'name'],
            [{ name: 'Fulano', email: 'fulano@teste.local', password: 'Inicial123', role: 'root' }, 'role'],
        ];
        for (const [body, field] of cases) {
            const res = await request(app).post('/api/users').set(auth(root.token)).send(body);
            assert.equal(res.status, 400, JSON.stringify(body));
            assert.ok(res.body.error.details.some((d) => d.field === field), `esperava erro em ${field}`);
        }
    });
});

describe('conta raiz', () => {
    test('outro super admin: nome, e-mail ou perfil -> 409; exclusão -> 409; senha -> 403; nada muda', async () => {
        const other = await account('superadmin');
        for (const body of [{ name: 'Outro Nome' }, { email: 'outro@teste.local' }, { role: 'admin' }, { name: 'Outro Nome', password: 'Trocada123' }]) {
            const res = await patchAs(other, root.id, body);
            assert.equal(res.status, 409, JSON.stringify(body));
            assert.equal(res.body.error.message, 'A conta do super admin raiz só permite trocar a senha.');
        }
        const remove = await deleteAs(other, root.id);
        assert.equal(remove.status, 409);
        assert.equal(remove.body.error.message, 'A conta do super admin raiz não pode ser excluída.');

        const password = await patchAs(other, root.id, { password: 'Trocada123' });
        assert.equal(password.status, 403);
        assert.equal(password.body.error.message, 'Só o próprio super admin raiz pode trocar a senha dessa conta.');

        assert.equal((await login('raiz@teste.local')).status, 200, 'a senha da raiz continua a mesma');
        const current = (await listAs(root)).find((u) => u.id === root.id);
        assert.deepEqual([current.name, current.email, current.role, current.isRoot], ['Raiz', 'raiz@teste.local', 'superadmin', true]);
    });

    test('a própria raiz: nome, e-mail, perfil ou exclusão -> 409; só a senha -> 200 e vale no login', async () => {
        for (const body of [{ name: 'Raiz Nova' }, { email: 'raiz.nova@teste.local' }, { role: 'admin' }]) {
            const res = await patchAs(root, root.id, body);
            assert.equal(res.status, 409, JSON.stringify(body));
            assert.equal(res.body.error.message, 'A conta do super admin raiz só permite trocar a senha.');
        }
        assert.equal((await deleteAs(root, root.id)).status, 409);

        const res = await patchAs(root, root.id, { password: 'RaizNova123' });
        assert.equal(res.status, 200);
        assert.equal(res.body.user.isRoot, true);
        assert.equal((await login('raiz@teste.local', 'RaizNova123')).status, 200);
        assert.equal((await login('raiz@teste.local')).status, 401);
        await patchAs(root, root.id, { password: PASSWORD }); // volta a senha para os outros testes
    });

    test('id inexistente vem antes das regras -> 404', async () => {
        assert.equal((await patchAs(root, 9999, { role: 'admin' })).status, 404);
        assert.equal((await deleteAs(root, 9999)).status, 404);
    });
});

describe('super admin criado', () => {
    test('edita, rebaixa e exclui um admin, um usuário e outro super admin criado', async () => {
        const manager = await account('superadmin');
        for (const role of ['admin', 'viewer', 'superadmin']) {
            const target = await account(role);
            const edit = await patchAs(manager, target.id, { name: `Editado ${role}`, email: `editado.${target.email}` });
            assert.equal(edit.status, 200);
            assert.equal(edit.body.user.name, `Editado ${role}`);

            const newRole = role === 'viewer' ? 'admin' : 'viewer';
            const change = await patchAs(manager, target.id, { role: newRole });
            assert.equal(change.status, 200);
            assert.equal(change.body.user.role, newRole);

            assert.equal((await patchAs(manager, target.id, { password: 'Trocada123' })).status, 200);
            assert.equal((await deleteAs(manager, target.id)).status, 204);
        }
    });

    test('não rebaixa nem exclui a própria conta (409), mas edita o próprio nome, e-mail e senha', async () => {
        const self = await account('superadmin');
        for (const role of ['admin', 'viewer']) {
            const demote = await patchAs(self, self.id, { role });
            assert.equal(demote.status, 409);
            assert.equal(demote.body.error.message, 'Você não pode rebaixar a sua própria conta.');
        }
        const remove = await deleteAs(self, self.id);
        assert.equal(remove.status, 409);
        assert.equal(remove.body.error.message, 'Você não pode excluir a sua própria conta.');

        const edit = await patchAs(self, self.id, { name: 'Eu Mesmo', email: 'eu.mesmo@teste.local', password: 'MinhaNova123' });
        assert.equal(edit.status, 200);
        assert.equal(edit.body.user.role, 'superadmin');
        assert.equal((await request(app).get('/api/users').set(auth(self.token))).status, 200); // mesmo token
        assert.equal((await login('eu.mesmo@teste.local', 'MinhaNova123')).status, 200);

        const mixed = await patchAs(self, self.id, { name: 'Outro Nome', role: 'viewer' });
        assert.equal(mixed.status, 409);
        assert.equal((await listAs(root)).find((u) => u.id === self.id).name, 'Eu Mesmo'); // o nome não mudou junto
    });
});

describe('alterar perfil, dados e senha, e excluir', () => {
    test('promover e rebaixar valem na hora, com o mesmo token', async () => {
        const target = await account('viewer');
        assert.equal((await request(app).get('/api/users').set(auth(target.token))).status, 403);

        assert.equal((await patchAs(root, target.id, { role: 'superadmin' })).body.user.role, 'superadmin');
        assert.equal((await request(app).get('/api/users').set(auth(target.token))).status, 200); // token antigo, perfil novo

        assert.equal((await patchAs(root, target.id, { role: 'admin' })).body.user.role, 'admin');
        assert.equal((await request(app).get('/api/users').set(auth(target.token))).status, 403);
    });

    test('edita nome e e-mail: o login passa a valer com o e-mail novo e não com o antigo', async () => {
        const target = await account('viewer');
        const res = await patchAs(root, target.id, { name: 'Depois', email: 'depois@teste.local' });
        assert.equal(res.status, 200);
        assert.equal(res.body.user.name, 'Depois');
        assert.equal(res.body.user.email, 'depois@teste.local');
        assert.equal((await login('depois@teste.local')).status, 200);
        assert.equal((await login(target.email)).status, 401);
    });

    test('e-mail de outra conta -> 409; o próprio e-mail -> 200', async () => {
        const target = await account('admin');
        const taken = await patchAs(root, target.id, { email: 'raiz@teste.local' });
        assert.equal(taken.status, 409);
        assert.deepEqual(taken.body.error.details, { fields: ['email'] });
        assert.doesNotMatch(JSON.stringify(taken.body), /UNIQUE|SQLITE|constraint/i);
        assert.equal((await patchAs(root, target.id, { email: target.email.toUpperCase() })).status, 200);
    });

    test('e-mail recusado não deixa mudar o nome nem o perfil enviados junto', async () => {
        const target = await account('viewer');
        const taken = await patchAs(root, target.id, { name: 'Mudou', role: 'admin', email: 'raiz@teste.local' });
        assert.equal(taken.status, 409);
        const current = (await listAs(root)).find((u) => u.id === target.id);
        assert.equal(current.name, 'Conta viewer');
        assert.equal(current.role, 'viewer');
    });

    test('redefinir senha: entra com a nova, não com a antiga', async () => {
        const target = await account('viewer');
        assert.equal((await patchAs(root, target.id, { password: 'NovaSenha9' })).status, 200);
        assert.equal((await login(target.email, 'NovaSenha9')).status, 200);
        assert.equal((await login(target.email)).status, 401);
    });

    test('corpo inválido -> 400 com o campo', async () => {
        const target = await account('viewer');
        const cases = [
            [{}, 'body'], // nenhum campo
            [{ role: 'root' }, 'role'],
            [{ password: 'curta1' }, 'password'],
            [{ password: 'semnumero' }, 'password'],
        ];
        for (const [body, field] of cases) {
            const res = await patchAs(root, target.id, body);
            assert.equal(res.status, 400, JSON.stringify(body));
            assert.ok(res.body.error.details.some((d) => d.field === field), `esperava erro em ${field} para ${JSON.stringify(body)}`);
        }
        const empty = await patchAs(root, target.id, {});
        assert.ok(empty.body.error.details.some((d) => d.message === 'Informe ao menos um campo para alterar.'));
        assert.equal((await request(app).patch('/api/users/abc').set(auth(root.token)).send({ role: 'admin' })).status, 400);
    });

    test('excluir: 204, some da lista, o token antigo dá 401 e o alerta reconhecido fica sem autor', async () => {
        const target = await account('admin');
        const db = getDb();
        const deviceId = db.prepare(`INSERT INTO devices (name, host, check_type, category_id) VALUES ('ALVO', '10.0.0.1', 'ping', 1)`).run().lastInsertRowid;
        const alertId = db.prepare(
            `INSERT INTO alerts (device_id, kind, severity, status, title, acknowledged_at, acknowledged_by)
             VALUES (?, 'offline', 'critical', 'ativo', 'ALVO está offline', ?, ?)`,
        ).run(deviceId, new Date().toISOString(), target.id).lastInsertRowid;

        assert.equal((await deleteAs(root, target.id)).status, 204);

        assert.ok(!(await listAs(root)).some((u) => u.id === target.id));
        assert.equal((await request(app).get('/api/devices').set(auth(target.token))).status, 401);

        const { alerts } = (await request(app).get('/api/alerts').set(auth(root.token))).body;
        const alert = alerts.find((a) => a.id === Number(alertId));
        assert.ok(alert.acknowledgedAt, 'o reconhecimento continua registrado');
        assert.equal(alert.acknowledgedBy, null);
    });
});
