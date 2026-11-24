// Teste de integração do monitor: banco em memória + verificação FALSA.
// A função de checagem é trocada por uma que devolve o resultado que o teste
// quiser, então dá para simular queda e volta sem rede.
// Rodar: npm test
import assert from 'node:assert/strict';
import { before, test } from 'node:test';

// Configuração própria dos testes (antes de importar o código, que lê o ambiente)
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = ':memory:';
process.env.JWT_SECRET = 'segredo-somente-para-testes-automatizados-123';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.MONITOR_ENABLED = 'false';
process.env.MONITOR_FAILURE_THRESHOLD = '3';

const { openDb } = await import('../src/lib/db.js');
const { migrate } = await import('../db/migrate.js');
const { seed } = await import('../db/seed.js');
const monitor = await import('../src/monitor/monitor.js');

let db;
let nextResult; // o que a verificação falsa vai responder
const UP_SLOW = { success: true, latencyMs: 350, error: null };
const UP_FAST = { success: true, latencyMs: 5, error: null };
const DOWN = { success: false, latencyMs: null, error: 'Conexão recusada (porta fechada)' };

before(async () => {
    db = openDb({ create: true });
    migrate(db, { log: () => {} });
    await seed(db, { name: 'Admin', email: 'admin@teste.local', password: 'Senha123' }, { demo: true });
    monitor.setCheckFunction(async () => nextResult);
});

/** Faz `times` verificações do dispositivo com o resultado dado. */
async function check(deviceId, result, times = 1) {
    nextResult = result;
    for (let i = 0; i < times; i++) await monitor.checkDevice(deviceId);
}

const deviceId = (name) => db.prepare('SELECT id FROM devices WHERE name = ?').pluck().get(name);
const device = (id) => db.prepare('SELECT status, consecutive_failures AS failures FROM devices WHERE id = ?').get(id);
const count = (sql, ...params) => db.prepare(sql).pluck().get(...params);

test('atenção -> cai -> volta: eventos e alertas abrem e fecham sozinhos, sem duplicar', async () => {
    const id = deviceId('INVERSOR-DEMO'); // limite de latência 200 ms

    await check(id, UP_SLOW, 2);
    assert.equal(device(id).status, 'atencao');
    assert.equal(count("SELECT COUNT(*) FROM alerts WHERE device_id = ? AND kind = 'latency' AND status = 'ativo'", id), 1);

    // 2 falhas: ainda não confirma a queda (e precisa contar as falhas, mesmo em atenção)
    await check(id, DOWN, 2);
    assert.deepEqual(device(id), { status: 'atencao', failures: 2 });

    // 3ª falha: offline. O pico é encerrado e a queda é aberta.
    await check(id, DOWN);
    assert.equal(device(id).status, 'offline');
    assert.equal(count('SELECT COUNT(*) FROM latency_events WHERE device_id = ? AND resolved = 0', id), 0);
    assert.equal(count('SELECT COUNT(*) FROM downtime_events WHERE device_id = ? AND ended_at IS NULL', id), 1);

    // Continua fora: nenhuma queda ou alerta novo
    await check(id, DOWN, 5);
    assert.equal(count('SELECT COUNT(*) FROM downtime_events WHERE device_id = ?', id), 1);
    assert.equal(count("SELECT COUNT(*) FROM alerts WHERE device_id = ? AND kind = 'offline'", id), 1);

    // Volta (rápido): queda fechada e alertas resolvidos
    await check(id, UP_FAST, 3);
    assert.equal(device(id).status, 'online');
    assert.equal(count('SELECT COUNT(*) FROM downtime_events WHERE device_id = ? AND ended_at IS NULL', id), 0);
    assert.equal(count("SELECT COUNT(*) FROM alerts WHERE device_id = ? AND status = 'ativo'", id), 0);
    assert.equal(count('SELECT COUNT(*) FROM checks WHERE device_id = ?', id), 13);
});

test('dispositivo pausado não é verificado', async () => {
    const id = deviceId('GW-LOCAL');
    db.prepare('UPDATE devices SET monitoring_enabled = 0 WHERE id = ?').run(id);
    await check(id, DOWN, 3);
    assert.equal(count('SELECT COUNT(*) FROM checks WHERE device_id = ?', id), 0);
    assert.equal(device(id).status, 'pendente');
});

// ---------------------------------------------------------------------------
// Perda de pacotes: a verificação falsa informa quantas das 4 tentativas falharam
// ---------------------------------------------------------------------------
const partial = (lost, latencyMs = 5) => ({ success: true, latencyMs, error: lost ? 'Conexão encerrada pelo dispositivo' : null, packetsSent: 4, packetsLost: lost });

test('perda de pacotes: abre evento e alerta, não duplica e resolve ao normalizar', async () => {
    const id = deviceId('CAM-DEMO'); // limite de perda padrão: 20%

    await check(id, partial(2), 4); // 50% de perda
    assert.equal(device(id).status, 'atencao');
    assert.equal(count('SELECT COUNT(*) FROM loss_events WHERE device_id = ? AND resolved = 0', id), 1);
    assert.equal(count("SELECT COUNT(*) FROM alerts WHERE device_id = ? AND kind = 'loss' AND status = 'ativo'", id), 1);
    assert.equal(count('SELECT COUNT(*) FROM loss_events WHERE device_id = ?', id), 1, 'não pode duplicar o evento');
    assert.deepEqual(
        db.prepare('SELECT packets_sent AS sent, packets_lost AS lost FROM checks WHERE device_id = ? ORDER BY id DESC LIMIT 1').get(id),
        { sent: 4, lost: 2 },
    );
    assert.equal(db.prepare('SELECT last_loss_pct FROM devices WHERE id = ?').pluck().get(id), 50);

    await check(id, partial(0), 3); // perda zero: a janela de 3 verificações fica limpa
    assert.equal(device(id).status, 'online');
    assert.equal(count('SELECT COUNT(*) FROM loss_events WHERE device_id = ? AND resolved = 0', id), 0);
    const alert = db.prepare("SELECT status, message FROM alerts WHERE device_id = ? AND kind = 'loss'").get(id);
    assert.equal(alert.status, 'resolvido');
    assert.match(alert.message, /Perda normalizada/);
});

test('cair com latência e perda ativas encerra os dois eventos', async () => {
    const id = deviceId('REDE-INSTAVEL-DEMO'); // limites: 100 ms e 20%

    await check(id, partial(2, 350));
    assert.equal(count('SELECT COUNT(*) FROM latency_events WHERE device_id = ? AND resolved = 0', id), 1);
    assert.equal(count('SELECT COUNT(*) FROM loss_events WHERE device_id = ? AND resolved = 0', id), 1);
    assert.match(db.prepare('SELECT status_note FROM devices WHERE id = ?').pluck().get(id), /Latência alta.*Perda de pacotes/);

    await check(id, DOWN, 3);
    assert.equal(device(id).status, 'offline');
    assert.equal(count('SELECT COUNT(*) FROM latency_events WHERE device_id = ? AND resolved = 0', id), 0);
    assert.equal(count('SELECT COUNT(*) FROM loss_events WHERE device_id = ? AND resolved = 0', id), 0);
    const active = db.prepare("SELECT kind FROM alerts WHERE device_id = ? AND status = 'ativo'").pluck().all(id);
    assert.deepEqual(active, ['offline']);
});
