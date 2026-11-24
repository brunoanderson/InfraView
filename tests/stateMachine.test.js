// Testes da máquina de estados (função pura: sem rede e sem banco).
// Rodar: npm test
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { nextState } from '../src/monitor/stateMachine.js';

const OPTIONS = { failureThreshold: 3 };
const OK = { success: true };
const FAIL = { success: false };

/**
 * Simula uma sequência de verificações. Cada passo é OK, FAIL ou um número
 * (= sucesso com essa latência). Devolve o estado final e as transições de cada passo.
 */
function simulate(steps, start = { status: 'online', consecutiveFailures: 0 }) {
    let device = { latencyThresholdMs: 100, ...start };
    const latencies = [];
    const transitions = [];
    for (const step of steps) {
        const result = typeof step === 'number' ? { success: true } : step;
        if (typeof step === 'number') latencies.unshift(step);
        else if (step.success) latencies.unshift(10);
        const next = nextState(device, result, { ...OPTIONS, recentLatencies: latencies.slice(0, 3) });
        transitions.push(next.transitions);
        device = { ...device, status: next.status, consecutiveFailures: next.consecutiveFailures };
    }
    return { device, transitions };
}

describe('nextState', () => {
    test('cai: só fica offline na 3ª falha seguida, e avisa uma única vez', () => {
        const { device, transitions } = simulate([FAIL, FAIL, FAIL, FAIL]);
        assert.equal(device.status, 'offline');
        assert.deepEqual(transitions, [[], [], ['offline'], []]);
    });

    test('volta: o primeiro sucesso depois da queda já volta para online', () => {
        const { device, transitions } = simulate([OK], { status: 'offline', consecutiveFailures: 5 });
        assert.equal(device.status, 'online');
        assert.equal(device.consecutiveFailures, 0);
        assert.deepEqual(transitions, [['back_online']]);
    });

    test('oscila: falhas intercaladas com sucesso nunca geram queda (sem flapping)', () => {
        const { device, transitions } = simulate([FAIL, FAIL, OK, FAIL, FAIL, OK, FAIL]);
        assert.equal(device.status, 'online');
        assert.ok(transitions.every((t) => t.length === 0), 'nenhuma transição esperada');
    });

    test('latência alta: entra em atenção pela média e normaliza quando a média cai', () => {
        // limite 100 ms; médias das 3 últimas: 300, 300, 300, 203, 107 (ainda alta), 10 (normal)
        const { transitions, device } = simulate([300, 300, 300, 10, 10, 10]);
        assert.deepEqual(transitions, [['latency_high'], [], [], [], [], ['latency_ok']]);
        assert.equal(device.status, 'online');
    });

    test('um pico isolado não gera alerta (a média das 3 últimas fica abaixo do limite)', () => {
        const { transitions } = simulate([10, 10, 250, 10]);
        assert.ok(transitions.every((t) => t.length === 0));
    });

    test('cair estando em atenção encerra o pico e abre a queda', () => {
        const { transitions } = simulate([FAIL, FAIL, FAIL], { status: 'atencao', consecutiveFailures: 0 });
        assert.deepEqual(transitions[2], ['latency_ok', 'offline']);
    });

    test('dispositivo novo (pendente) que nunca responde vira offline no limiar', () => {
        const { device, transitions } = simulate([FAIL, FAIL, FAIL], { status: 'pendente', consecutiveFailures: 0 });
        assert.equal(device.status, 'offline');
        assert.deepEqual(transitions, [[], [], ['offline']]);
    });

    test('dispositivo novo que responde vira online sem gerar evento', () => {
        const { device, transitions } = simulate([OK], { status: 'pendente', consecutiveFailures: 0 });
        assert.equal(device.status, 'online');
        assert.deepEqual(transitions, [[]]);
    });
});

// ---------------------------------------------------------------------------
// Perda de pacotes (4 tentativas por verificação, limite de 20%)
// ---------------------------------------------------------------------------

/**
 * Simula verificações com perda. Cada passo é 'DOWN' (nenhuma tentativa respondeu)
 * ou { lost, latency } (respondeu, com `lost` de 4 tentativas perdidas).
 * Faz o papel do monitor: janela das últimas 3 verificações COM RESPOSTA e
 * controle de quais problemas estão abertos.
 */
function simulateLoss(steps, start = { status: 'online', consecutiveFailures: 0 }, open = { latency: false, loss: false }) {
    let device = { latencyThresholdMs: 100, lossThresholdPct: 20, ...start };
    let active = { ...open };
    const answered = []; // { sent, lost, latency } das verificações com resposta, mais recente primeiro
    const transitions = [];
    for (const step of steps) {
        const result = step === 'DOWN' ? { success: false } : { success: true };
        if (result.success) answered.unshift({ sent: 4, lost: step.lost, latency: step.latency ?? 10 });
        const window = answered.slice(0, 3);
        const next = nextState(device, result, {
            ...OPTIONS,
            recentLatencies: window.map((c) => c.latency),
            recentLoss: { sent: window.reduce((s, c) => s + c.sent, 0), lost: window.reduce((s, c) => s + c.lost, 0) },
            active,
        });
        transitions.push(next.transitions);
        for (const t of next.transitions) {
            if (t === 'latency_high') active.latency = true;
            if (t === 'latency_ok') active.latency = false;
            if (t === 'loss_high') active.loss = true;
            if (t === 'loss_ok') active.loss = false;
        }
        device = { ...device, status: next.status, consecutiveFailures: next.consecutiveFailures };
    }
    return { device, transitions, active };
}

const ok = (lost = 0, latency = 10) => ({ lost, latency });

describe('nextState com perda de pacotes', () => {
    test('perda sobe: acima de 20% entra em atenção e avisa uma vez só', () => {
        const { device, transitions } = simulateLoss([ok(2), ok(2), ok(2)]); // 50% de perda
        assert.equal(device.status, 'atencao');
        assert.deepEqual(transitions, [['loss_high'], [], []]);
    });

    test('perda normaliza quando a perda acumulada das 3 últimas cai abaixo do limite', () => {
        // janelas: 2/4=50%, 2/8=25%, 2/12=17% -> normalizou no 3º passo
        const { device, transitions } = simulateLoss([ok(2), ok(0), ok(0), ok(0)]);
        assert.deepEqual(transitions, [['loss_high'], [], ['loss_ok'], []]);
        assert.equal(device.status, 'online');
    });

    test('perda e latência juntas: cada uma tem sua transição', () => {
        const { device, transitions, active } = simulateLoss([ok(2, 300)]);
        assert.deepEqual(transitions, [['latency_high', 'loss_high']]);
        assert.equal(device.status, 'atencao');
        assert.deepEqual(active, { latency: true, loss: true });
    });

    test('perda total vira queda (sem alerta de perda), e cair encerra latência e perda abertas', () => {
        const fromOnline = simulateLoss(['DOWN', 'DOWN', 'DOWN']);
        assert.deepEqual(fromOnline.transitions, [[], [], ['offline']]);

        const fromBoth = simulateLoss(['DOWN', 'DOWN', 'DOWN'], { status: 'atencao', consecutiveFailures: 0 }, { latency: true, loss: true });
        assert.deepEqual(fromBoth.transitions[2], ['latency_ok', 'loss_ok', 'offline']);
        assert.equal(fromBoth.device.status, 'offline');
    });

    test('perda abaixo do limite não gera nada', () => {
        // 1 perdida a cada duas verificações: no máximo 2 de 12 (17%)
        const { device, transitions } = simulateLoss([ok(0), ok(0), ok(0), ok(1), ok(0), ok(1), ok(0), ok(1)]);
        assert.ok(transitions.every((t) => t.length === 0));
        assert.equal(device.status, 'online');
    });

    test('oscilação: uma verificação ruim isolada entre boas não gera alerta (sem flapping)', () => {
        const { transitions } = simulateLoss([ok(0), ok(0), ok(2), ok(0), ok(0), ok(2), ok(0), ok(0)]);
        assert.ok(transitions.every((t) => t.length === 0), 'nenhuma transição esperada');
    });

    test('ao voltar de uma queda, as falhas totais não contam como perda', () => {
        const { transitions } = simulateLoss(['DOWN', 'DOWN', 'DOWN', ok(0)]);
        assert.deepEqual(transitions[3], ['back_online']);
    });
});
