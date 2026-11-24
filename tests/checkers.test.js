// Teste do summarize(): junta as 4 tentativas de uma verificação num resultado só.
// Função pura: não usa rede nem banco.
// Rodar: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarize } from '../src/monitor/checkers.js';

const ok = (latencyMs) => ({ success: true, latencyMs, error: null });
const fail = (error = 'Tempo esgotado') => ({ success: false, latencyMs: null, error });

test('todas responderam: sem perda e latência média', () => {
    assert.deepEqual(summarize([ok(2), ok(4), ok(6), ok(8)]), {
        success: true, latencyMs: 5, error: null, packetsSent: 4, packetsLost: 0,
    });
});

test('perda parcial: continua no ar, média só das que responderam e o motivo da falha', () => {
    assert.deepEqual(summarize([ok(10), fail('Conexão encerrada pelo dispositivo'), ok(20), fail()]), {
        success: true, latencyMs: 15, error: 'Conexão encerrada pelo dispositivo', packetsSent: 4, packetsLost: 2,
    });
});

test('nenhuma respondeu: falha total (queda), sem latência', () => {
    assert.deepEqual(summarize([fail(), fail(), fail(), fail()]), {
        success: false, latencyMs: null, error: 'Tempo esgotado', packetsSent: 4, packetsLost: 4,
    });
});
