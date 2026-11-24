// =============================================================================
// devices.js — como mostrar um dispositivo (usado pela Rede e pelos Relatórios).
// Funções puras: recebem o objeto da API e devolvem texto ou classe CSS.
// =============================================================================
import { formatLatency, formatLoss } from './ui.js';

const CHECK_TYPE_LABELS = { ping: 'Ping', tcp: 'TCP', http: 'HTTP' };

/** "Ping", "TCP :7010", "HTTP :7011" */
export function checkTypeText(device) {
    const label = CHECK_TYPE_LABELS[device.checkType] ?? device.checkType;
    return device.port ? `${label} :${device.port}` : label;
}

/**
 * Latência e perda só fazem sentido se o dispositivo está respondendo agora.
 * Offline, pendente ou pausado: a tela mostra "—".
 */
export function hasCurrentMeasurement(device) {
    return device.monitoringEnabled && (device.status === 'online' || device.status === 'atencao');
}

/** Latência média da última verificação (média das tentativas que responderam). */
export function latencyText(device) {
    return hasCurrentMeasurement(device) ? formatLatency(device.latencyMs) : '—';
}

/** Perda de pacotes da última verificação. */
export function lossText(device) {
    return hasCurrentMeasurement(device) ? formatLoss(device.lastLossPct) : '—';
}

/** Cor do valor em relação ao limite: verde, amarelo (perto) ou vermelho (acima). */
function levelClass(value, limit) {
    if (value === null || value === undefined) return 'text-custom';
    if (value > limit) return 'text-danger';
    if (value > limit * 0.7) return 'text-warning';
    return 'text-success';
}

export function latencyClass(device) {
    return hasCurrentMeasurement(device) ? levelClass(device.latencyMs, device.latencyThresholdMs) : 'text-custom';
}

export function lossClass(device) {
    return hasCurrentMeasurement(device) ? levelClass(device.lastLossPct, device.lossThresholdPct) : 'text-custom';
}

/** Ícones oferecidos no formulário (classes do Bootstrap Icons). */
export const DEVICE_ICONS = [
    { value: 'bi-router', label: 'Roteador / Access Point' },
    { value: 'bi-wifi', label: 'Wi-Fi' },
    { value: 'bi-server', label: 'Servidor' },
    { value: 'bi-hdd-stack', label: 'NAS / DVR' },
    { value: 'bi-camera-video', label: 'Câmera' },
    { value: 'bi-shield-lock', label: 'Alarme' },
    { value: 'bi-brightness-high', label: 'Inversor solar' },
    { value: 'bi-battery-charging', label: 'Nobreak' },
    { value: 'bi-plug', label: 'Tomada inteligente' },
    { value: 'bi-pc-display', label: 'Computador' },
    { value: 'bi-laptop', label: 'Notebook' },
    { value: 'bi-phone', label: 'Celular' },
    { value: 'bi-tv', label: 'TV' },
    { value: 'bi-printer', label: 'Impressora' },
    { value: 'bi-hdd', label: 'Outro' },
];

// ---- Formulário: validação (as mesmas regras do zod no back-end) -------------

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isIPv6(host) {
    if (!host.includes(':')) return false;
    try {
        new URL(`http://[${host}]/`); // o próprio navegador valida o endereço IPv6
        return true;
    } catch {
        return false;
    }
}

const isInt = (value) => Number.isInteger(value);

/**
 * Valida os valores do formulário de dispositivo.
 * @param values { name, model, host, checkType, port, latencyThresholdMs, lossThresholdPct, categoryId }
 *        (números já convertidos; campo vazio = null)
 * @returns { campo: mensagem } — objeto vazio se estiver tudo certo
 */
export function validateDevice(values) {
    const errors = {};
    const name = (values.name ?? '').trim();
    if (name.length < 2) errors.name = 'O nome precisa ter pelo menos 2 caracteres.';
    else if (name.length > 60) errors.name = 'O nome pode ter no máximo 60 caracteres.';

    if ((values.model ?? '').trim().length > 100) errors.model = 'Use no máximo 100 caracteres.';

    const host = (values.host ?? '').trim();
    if (!host) errors.host = 'Informe o host (IP ou nome).';
    else if (host.length > 253) errors.host = 'Host longo demais.';
    else if (/\s/.test(host)) errors.host = 'O host não pode ter espaços.';
    else if (host.startsWith('-')) errors.host = 'O host não pode começar com "-".';
    else if (!IPV4_RE.test(host) && !isIPv6(host) && !HOSTNAME_RE.test(host)) {
        errors.host = 'Informe um IP (ex.: 192.168.0.10) ou nome de host válido (ex.: roteador.lan).';
    }

    if (!['ping', 'tcp', 'http'].includes(values.checkType)) {
        errors.checkType = 'Tipo de verificação deve ser ping, tcp ou http.';
    } else if (values.checkType === 'ping') {
        if (values.port !== null) errors.port = 'A verificação por ping não usa porta. Deixe a porta vazia.';
    } else if (values.port === null) {
        errors.port = `Informe a porta para a verificação ${values.checkType}.`;
    } else if (!isInt(values.port) || values.port < 1 || values.port > 65535) {
        errors.port = 'A porta vai de 1 a 65535.';
    }

    const latency = values.latencyThresholdMs;
    if (!isInt(latency) || latency < 1 || latency > 10_000) errors.latencyThresholdMs = 'O limite de latência vai de 1 a 10000 ms.';

    const loss = values.lossThresholdPct;
    if (!isInt(loss) || loss < 1 || loss > 100) errors.lossThresholdPct = 'O limite de perda vai de 1% a 100%.';

    if (!isInt(values.categoryId) || values.categoryId < 1) errors.categoryId = 'Escolha a categoria.';
    return errors;
}

/** Corpo para POST/PUT /api/devices a partir de um dispositivo da API (com mudanças opcionais). */
export function toRequestBody(device, changes = {}) {
    return {
        name: device.name,
        model: device.model,
        host: device.host,
        checkType: device.checkType,
        port: device.port,
        latencyThresholdMs: device.latencyThresholdMs,
        lossThresholdPct: device.lossThresholdPct,
        categoryId: device.category.id,
        isGateway: device.isGateway,
        icon: device.icon,
        monitoringEnabled: device.monitoringEnabled,
        ...changes,
    };
}
