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
