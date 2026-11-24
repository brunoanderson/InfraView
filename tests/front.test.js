// =============================================================================
// Testes das funções puras do front (formatação, regras de exibição e
// validação do formulário). São os mesmos arquivos que o navegador carrega,
// importados direto no Node: nenhuma dessas funções usa o DOM.
// Rodar: npm test
// =============================================================================
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatDuration, formatLatency, formatLoss, formatPercent } from '../public/js/ui.js';
import { checkTypeText, latencyText, lossText, toRequestBody, validateDevice } from '../public/js/devices.js';
import { mergeEvents } from '../public/js/events.js';

describe('formatação (ui.js)', () => {
    test('duração em segundos fica legível', () => {
        assert.equal(formatDuration(45), '45 s');
        assert.equal(formatDuration(12 * 60), '12 min');
        assert.equal(formatDuration(3 * 3600 + 5 * 60), '3h 05min');
        assert.equal(formatDuration(2 * 86400 + 4 * 3600), '2d 04h');
        assert.equal(formatDuration(null), '—');
    });

    test('latência e perda', () => {
        assert.equal(formatLatency(0), '<1 ms'); // o ping mede em ms inteiros
        assert.equal(formatLatency(37), '37 ms');
        assert.equal(formatLatency(null), '—');
        assert.equal(formatLoss(25), '25%');
        assert.equal(formatLoss(null), '—');
        assert.equal(formatPercent(99.7), '99.7%'); // disponibilidade do gateway
        assert.equal(formatPercent(undefined), '—');
    });
});

describe('exibição de dispositivos (devices.js)', () => {
    const online = { status: 'online', monitoringEnabled: true, latencyMs: 4, lastLossPct: 25, checkType: 'http', port: 7012 };

    test('tipo de verificação com porta', () => {
        assert.equal(checkTypeText(online), 'HTTP :7012');
        assert.equal(checkTypeText({ checkType: 'ping', port: null }), 'Ping');
    });

    test('latência e perda aparecem só quando o dispositivo responde agora', () => {
        assert.equal(latencyText(online), '4 ms');
        assert.equal(lossText(online), '25%');
        for (const d of [
            { ...online, status: 'offline', lastLossPct: 100 },
            { ...online, status: 'pendente' },
            { ...online, monitoringEnabled: false },
        ]) {
            assert.equal(latencyText(d), '—');
            assert.equal(lossText(d), '—');
        }
    });
});

describe('validação do formulário de dispositivo (mesmas regras do zod)', () => {
    const valid = { name: 'AP-SALA', model: null, host: '192.168.0.10', checkType: 'ping', port: null, latencyThresholdMs: 100, lossThresholdPct: 20, categoryId: 1 };

    test('dados válidos não geram erro (IPv4, IPv6 e nome de host)', () => {
        assert.deepEqual(validateDevice(valid), {});
        assert.deepEqual(validateDevice({ ...valid, host: '::1' }), {});
        assert.deepEqual(validateDevice({ ...valid, host: 'roteador.lan', checkType: 'tcp', port: 80 }), {});
    });

    test('erros por campo', () => {
        const cases = [
            [{ name: 'A' }, 'name'],
            [{ host: '1.2.3.4 & del *' }, 'host'],
            [{ host: '-c' }, 'host'],
            [{ host: 'nome_invalido' }, 'host'],
            [{ checkType: 'tcp' }, 'port'], // tcp sem porta
            [{ port: 80 }, 'port'], // ping com porta
            [{ checkType: 'http', port: 70000 }, 'port'],
            [{ latencyThresholdMs: 0 }, 'latencyThresholdMs'],
            [{ lossThresholdPct: 0 }, 'lossThresholdPct'],
            [{ lossThresholdPct: 101 }, 'lossThresholdPct'],
            [{ categoryId: null }, 'categoryId'],
        ];
        for (const [change, field] of cases) {
            assert.ok(validateDevice({ ...valid, ...change })[field], `esperava erro em ${field} para ${JSON.stringify(change)}`);
        }
    });

    test('toRequestBody monta o corpo da API a partir do dispositivo', () => {
        const device = { ...valid, icon: 'bi-router', isGateway: false, monitoringEnabled: true, category: { id: 3 }, status: 'online', id: 9 };
        const body = toRequestBody(device, { monitoringEnabled: false });
        assert.equal(body.categoryId, 3);
        assert.equal(body.monitoringEnabled, false);
        assert.equal(body.status, undefined, 'status é do monitor, não vai no corpo');
    });
});

describe('eventos (events.js)', () => {
    test('junta as três listas, do mais recente para o mais antigo', () => {
        const merged = mergeEvents({
            downtime: [{ id: 1, startedAt: '2026-11-24T10:00:00.000Z', ongoing: true, durationSeconds: 120 }],
            latency: [{ id: 1, recordedAt: '2026-11-24T12:00:00.000Z', resolved: true, latencyMs: 360, thresholdMs: 200 }],
            loss: [{ id: 1, recordedAt: '2026-11-24T11:00:00.000Z', resolved: false, lossPct: 50, thresholdPct: 20 }],
        });
        assert.deepEqual(merged.map((e) => e.key), ['l1', 'p1', 'd1']); // chaves únicas mesmo com ids iguais
        assert.deepEqual(merged.map((e) => e.open), [false, true, true]);
        assert.equal(merged[1].text, 'Perda de 50% (limite 20%)');
    });
});
