// =============================================================================
// Testes das rotas principais com supertest: o app roda em memória, sem abrir
// porta. Banco :memory:, monitor desligado e verificação FALSA (sem rede).
// Rodar: npm test
// =============================================================================
import './helpers/env.js'; // primeiro: define o ambiente de teste
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import request from 'supertest';

const { openDb } = await import('../src/lib/db.js');
const { migrate } = await import('../db/migrate.js');
const { seed } = await import('../db/seed.js');
const monitor = await import('../src/monitor/monitor.js');
const { createApp } = await import('../src/app.js');

const app = createApp();
const UP = { success: true, latencyMs: 5, error: null };
const DOWN = { success: false, latencyMs: null, error: 'Sem resposta ao ping' };
let nextResult = UP; // o que a verificação falsa responde
let adminToken;
let viewerToken;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const newDevice = (overrides = {}) => ({ name: 'ROTEADOR-TESTE', host: '192.168.50.1', checkType: 'ping', categoryId: 1, ...overrides });

before(async () => {
    const db = openDb({ create: true });
    migrate(db, { log: () => {} });
    await seed(db, { name: 'Admin', email: 'admin@teste.local', password: 'Senha123' }, { demo: true });
    monitor.setCheckFunction(async () => nextResult);

    adminToken = (await request(app).post('/api/auth/login').send({ email: 'admin@teste.local', password: 'Senha123' })).body.token;
    const viewer = await request(app).post('/api/auth/register').send({ name: 'Viewer', email: 'viewer@teste.local', password: 'Senha123' });
    viewerToken = viewer.body.token;
});

describe('autenticação e acesso', () => {
    test('login com senha errada -> 401', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'admin@teste.local', password: 'errada123' });
        assert.equal(res.status, 401);
        assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    });

    test('cadastro cria viewer mesmo enviando role admin', async () => {
        const res = await request(app).post('/api/auth/register')
            .send({ name: 'Esperto', email: 'esperto@teste.local', password: 'Senha123', role: 'admin' });
        assert.equal(res.status, 201);
        assert.equal(res.body.user.role, 'viewer');
    });

    test('rota protegida sem token -> 401', async () => {
        const res = await request(app).get('/api/devices');
        assert.equal(res.status, 401);
    });

    test('viewer pode ler, mas não escrever -> 403', async () => {
        assert.equal((await request(app).get('/api/devices').set(auth(viewerToken))).status, 200);
        const res = await request(app).post('/api/devices').set(auth(viewerToken)).send(newDevice());
        assert.equal(res.status, 403);
        assert.equal(res.body.error.code, 'FORBIDDEN');
    });
});

describe('CRUD de dispositivos', () => {
    let id;

    test('POST cria e já devolve o status medido (201)', async () => {
        nextResult = UP;
        const res = await request(app).post('/api/devices').set(auth(adminToken))
            .send(newDevice({ status: 'offline', latencyMs: 999 })); // status/latência do cliente são ignorados
        assert.equal(res.status, 201);
        assert.equal(res.body.device.status, 'online');
        assert.equal(res.body.device.latencyMs, 5);
        assert.equal(res.body.device.lossThresholdPct, 20); // padrão
        assert.equal(res.body.device.lastLossPct, 0); // 1 tentativa respondida (verificação falsa sem contagem)
        id = res.body.device.id;
    });

    test('validação -> 400 com erros por campo', async () => {
        const cases = [
            [newDevice({ host: '1.2.3.4 & del *' }), 'host'],
            [newDevice({ host: '-c' }), 'host'],
            [newDevice({ checkType: 'tcp' }), 'port'], // tcp sem porta
            [newDevice({ port: 80 }), 'port'], // ping com porta
            [newDevice({ checkType: 'http', port: 554 }), 'port'], // porta bloqueada pelo fetch
            [newDevice({ categoryId: 999 }), 'categoryId'],
            [newDevice({ lossThresholdPct: 0 }), 'lossThresholdPct'], // perda vai de 1% a 100%
            [newDevice({ lossThresholdPct: 101 }), 'lossThresholdPct'],
        ];
        for (const [body, field] of cases) {
            const res = await request(app).post('/api/devices').set(auth(adminToken)).send({ ...body, name: 'OUTRO' });
            assert.equal(res.status, 400, `esperava 400 para ${JSON.stringify(body)}`);
            assert.ok(res.body.error.details.some((d) => d.field === field), `esperava erro em ${field}`);
        }
    });

    test('duplicidade -> 409 (nome e host+tipo+porta)', async () => {
        const sameName = await request(app).post('/api/devices').set(auth(adminToken)).send(newDevice({ host: '192.168.50.2' }));
        assert.equal(sameName.status, 409);
        assert.match(sameName.body.error.message, /nome/);

        const sameTarget = await request(app).post('/api/devices').set(auth(adminToken)).send(newDevice({ name: 'OUTRO' }));
        assert.equal(sameTarget.status, 409);
        assert.match(sameTarget.body.error.message, /host/);
    });

    test('GET inexistente -> 404; id inválido -> 400', async () => {
        assert.equal((await request(app).get('/api/devices/9999').set(auth(viewerToken))).status, 404);
        assert.equal((await request(app).get('/api/devices/abc').set(auth(viewerToken))).status, 400);
    });

    test('busca e filtros na listagem', async () => {
        const res = await request(app).get('/api/devices?search=roteador&status=online').set(auth(viewerToken));
        assert.deepEqual(res.body.devices.map((d) => d.name), ['ROTEADOR-TESTE']);
    });

    test('PUT trocando o alvo zera o estado e verifica de novo', async () => {
        nextResult = DOWN;
        const res = await request(app).put(`/api/devices/${id}`).set(auth(adminToken)).send(newDevice({ host: '192.168.50.9' }));
        assert.equal(res.status, 200);
        assert.equal(res.body.device.host, '192.168.50.9');
        assert.equal(res.body.device.status, 'pendente'); // 1 falha: ainda não confirmou queda
        assert.equal(res.body.device.consecutiveFailures, 1);
    });

    test('verificar agora (admin) e pausado -> 409', async () => {
        nextResult = UP;
        const ok = await request(app).post(`/api/devices/${id}/check`).set(auth(adminToken));
        assert.equal(ok.status, 200);
        assert.equal(ok.body.checked, true);
        assert.equal(ok.body.device.status, 'online');

        await request(app).put(`/api/devices/${id}`).set(auth(adminToken)).send(newDevice({ host: '192.168.50.9', monitoringEnabled: false }));
        const paused = await request(app).post(`/api/devices/${id}/check`).set(auth(adminToken));
        assert.equal(paused.status, 409);
    });

    test('GET /:id/measurements: últimas verificações, da mais antiga para a mais nova', async () => {
        nextResult = DOWN;
        await request(app).put(`/api/devices/${id}`).set(auth(adminToken)).send(newDevice({ host: '192.168.50.9' })); // religa e verifica
        nextResult = UP;
        await request(app).post(`/api/devices/${id}/check`).set(auth(adminToken));

        const all = await request(app).get(`/api/devices/${id}/measurements`).set(auth(viewerToken)); // leitura: viewer pode
        assert.equal(all.status, 200);
        const list = all.body.measurements;
        assert.ok(list.length >= 2);
        assert.deepEqual(Object.keys(list[0]).sort(), ['checkedAt', 'latencyMs', 'packetsLost', 'success']);
        assert.deepEqual(list.map((m) => m.checkedAt), list.map((m) => m.checkedAt).toSorted());
        assert.deepEqual(list.at(-1), { ...list.at(-1), success: true, latencyMs: 5, packetsLost: 0 });
        assert.deepEqual(list.at(-2), { ...list.at(-2), success: false, latencyMs: null, packetsLost: 1 });

        const two = await request(app).get(`/api/devices/${id}/measurements?limit=2`).set(auth(viewerToken));
        assert.deepEqual(two.body.measurements, list.slice(-2)); // as 2 mais novas
    });

    test('GET /:id/measurements: limite inválido 400, inexistente 404, sem token 401', async () => {
        for (const limit of ['0', '121', 'abc']) {
            const res = await request(app).get(`/api/devices/${id}/measurements?limit=${limit}`).set(auth(viewerToken));
            assert.equal(res.status, 400, `limit=${limit}`);
            assert.equal(res.body.error.details[0].field, 'limit');
        }
        assert.equal((await request(app).get('/api/devices/9999/measurements').set(auth(viewerToken))).status, 404);
        assert.equal((await request(app).get(`/api/devices/${id}/measurements`)).status, 401);
    });

    test('DELETE -> 204, depois 404', async () => {
        assert.equal((await request(app).delete(`/api/devices/${id}`).set(auth(adminToken))).status, 204);
        assert.equal((await request(app).delete(`/api/devices/${id}`).set(auth(adminToken))).status, 404);
    });
});

describe('alertas, eventos e dashboard', () => {
    let gatewayId;

    test('queda gera alerta; viewer não reconhece (403); admin reconhece uma vez só', async () => {
        const devices = (await request(app).get('/api/devices?search=GW-LOCAL').set(auth(adminToken))).body.devices;
        gatewayId = devices[0].id;

        nextResult = UP;
        await request(app).post(`/api/devices/${gatewayId}/check`).set(auth(adminToken));
        nextResult = DOWN;
        for (let i = 0; i < 3; i++) await request(app).post(`/api/devices/${gatewayId}/check`).set(auth(adminToken));

        const alerts = (await request(app).get('/api/alerts?status=ativo').set(auth(viewerToken))).body.alerts;
        const alert = alerts.find((a) => a.device.id === gatewayId && a.kind === 'offline');
        assert.ok(alert, 'esperava um alerta de offline ativo');

        assert.equal((await request(app).patch(`/api/alerts/${alert.id}/ack`).set(auth(viewerToken))).status, 403);

        const ack = await request(app).patch(`/api/alerts/${alert.id}/ack`).set(auth(adminToken));
        assert.equal(ack.status, 200);
        assert.equal(ack.body.alert.acknowledgedBy.name, 'Admin');
        assert.ok(ack.body.alert.acknowledgedAt);

        assert.equal((await request(app).patch(`/api/alerts/${alert.id}/ack`).set(auth(adminToken))).status, 409);
        assert.equal((await request(app).patch('/api/alerts/9999/ack').set(auth(adminToken))).status, 404);
    });

    test('eventos: filtros de tipo, período e dispositivo', async () => {
        const all = (await request(app).get(`/api/events?period=0&device=${gatewayId}`).set(auth(viewerToken))).body;
        assert.equal(all.downtime.length, 1);
        assert.equal(all.downtime[0].ongoing, true);
        assert.equal(typeof all.downtime[0].durationSeconds, 'number');

        const onlyLatency = (await request(app).get('/api/events?type=latencia&period=all').set(auth(viewerToken))).body;
        assert.deepEqual(onlyLatency.downtime, []);

        assert.equal((await request(app).get('/api/events?period=15').set(auth(viewerToken))).status, 400);
    });

    test('perda de pacotes: alerta (kind=loss), evento (type=perda) e números do dashboard', async () => {
        const cam = (await request(app).get('/api/devices?search=CAM-DEMO').set(auth(adminToken))).body.devices[0];
        nextResult = { success: true, latencyMs: 5, error: 'Conexão encerrada pelo dispositivo', packetsSent: 4, packetsLost: 2 };
        const res = await request(app).post(`/api/devices/${cam.id}/check`).set(auth(adminToken));
        assert.equal(res.body.device.status, 'atencao');
        assert.equal(res.body.device.lastLossPct, 50);

        const alerts = (await request(app).get('/api/alerts?kind=loss').set(auth(viewerToken))).body.alerts;
        assert.equal(alerts.length, 1);
        assert.equal(alerts[0].device.id, cam.id);
        assert.equal((await request(app).get('/api/alerts?kind=xyz').set(auth(viewerToken))).status, 400);

        const events = (await request(app).get('/api/events?type=perda&period=0').set(auth(viewerToken))).body;
        assert.deepEqual(events.downtime, []);
        assert.deepEqual(events.latency, []);
        assert.equal(events.loss.length, 1);
        assert.equal(events.loss[0].lossPct, 50);
        assert.equal(events.loss[0].thresholdPct, 20);

        const all = (await request(app).get('/api/events?period=0').set(auth(viewerToken))).body;
        assert.ok(all.downtime.length > 0 && all.loss.length > 0, 'type=todos traz as três listas');

        const summary = (await request(app).get('/api/dashboard/summary').set(auth(viewerToken))).body;
        assert.equal(summary.devicesWithActiveLoss, 1);
        assert.ok(summary.averageLoss24hPct > 0);
        assert.equal(summary.gateway.averageLoss24hPct, 0); // o gateway só teve 1 tentativa respondida
        nextResult = UP;
    });

    test('dashboard com gateway: disponibilidade calculada das verificações', async () => {
        const res = await request(app).get('/api/dashboard/summary').set(auth(viewerToken));
        assert.equal(res.status, 200);
        const { gateway, devices, activeAlerts } = res.body;
        assert.equal(gateway.name, 'GW-LOCAL');
        assert.equal(gateway.checks24h, 4);
        assert.equal(gateway.availability24h, 25); // 1 sucesso em 4 verificações
        assert.equal(gateway.averageLatency24hMs, 5);
        assert.equal(devices.offline, 1);
        assert.ok(activeAlerts >= 1);
    });

    test('dashboard sem gateway: gateway = null', async () => {
        const gw = (await request(app).get(`/api/devices/${gatewayId}`).set(auth(adminToken))).body.device;
        await request(app).put(`/api/devices/${gatewayId}`).set(auth(adminToken)).send({
            name: gw.name, host: gw.host, checkType: gw.checkType, port: gw.port, categoryId: gw.category.id,
            latencyThresholdMs: gw.latencyThresholdMs, icon: gw.icon, monitoringEnabled: true, isGateway: false,
        });
        const res = await request(app).get('/api/dashboard/summary').set(auth(viewerToken));
        assert.equal(res.body.gateway, null);
    });
});
