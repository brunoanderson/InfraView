// =============================================================================
// Dashboard: números e listas calculados pela API, atualizados a cada 10 s.
//   GET /api/dashboard/summary   GET /api/events?period=0 (últimas 24h)
//   GET /api/devices (limites, para colorir as barras)   GET /api/monitor/status
// =============================================================================
import { api } from './api.js';
import { renderAlert } from './alertView.js';
import { levelTone } from './devices.js';
import { EVENT_TYPES, mergeEvents } from './events.js';
import { initPage, startAutoRefresh } from './layout.js';
import {
    badge, countdown, el, formatDateTime, formatDuration, formatLatency, formatPercent, meter, setText, statusLabel,
    syncOrEmpty, toast,
} from './ui.js';

const user = await initPage('dashboard');

// Recém-cadastrado (o cadastro manda ?bemvindo=1): avisa como a conta foi criada
// e limpa o parâmetro da barra de endereço.
if (new URLSearchParams(window.location.search).has('bemvindo')) {
    toast(`Conta criada. Bem-vindo(a), ${user.name}! Você entrou como visualizador.`, 'success');
    window.history.replaceState(null, '', 'dashboard.html');
}

const $ = (id) => document.getElementById(id);
const state = $('dashboardState');
const content = $('dashboardContent');
const RECENT_EVENTS = 8;
const SVG_NS = 'http://www.w3.org/2000/svg';

// ---- Faixa "Estado da rede" -----------------------------------------------------

function networkState({ devices, activeAlerts }) {
    if (devices.total === 0) return { tone: 'neutral', text: 'Nenhum dispositivo monitorado' };
    if (activeAlerts === 0 && devices.atencao === 0 && devices.offline === 0) return { tone: 'success', text: 'Tudo operacional' };
    const tone = devices.offline > 0 ? 'danger' : 'warning';
    if (activeAlerts > 0) return { tone, text: `${activeAlerts} problema(s) ativo(s)` };
    return { tone, text: `${devices.atencao} dispositivo(s) em atenção` };
}

let lastStateKey = '';
function renderStatusBand(summary, monitor) {
    const { tone, text } = networkState(summary);
    if (`${tone}|${text}` !== lastStateKey) {
        lastStateKey = `${tone}|${text}`;
        $('networkState').replaceChildren(badge(text, tone, { live: tone !== 'neutral' }));
    }
    const next = $('nextCheck');
    if (!monitor.enabled) setText(next, 'monitor desligado');
    else if (next.firstElementChild?.dateTime !== monitor.nextRoundAt) next.replaceChildren(countdown(monitor.nextRoundAt));
}

// ---- Cards de números ----------------------------------------------------------

const average = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

/** Número com barra: cheia = no limite médio dos dispositivos monitorados. */
function renderMetricWithLimit(id, value, limit, unit) {
    const tone = levelTone(value, limit);
    $(`${id}Meter`).replaceChildren(meter([{ percent: value !== null && limit ? (value / limit) * 100 : 0, tone }]));
    setText($(`${id}Sub`), limit ? `limite médio ${Math.round(limit)}${unit}` : '');
}

/** Medidor circular (SVG) da disponibilidade do gateway. */
function gauge(percent, tone) {
    const radius = 30;
    const length = 2 * Math.PI * radius;
    const circle = (className) => {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('class', className);
        c.setAttribute('cx', '36');
        c.setAttribute('cy', '36');
        c.setAttribute('r', String(radius));
        return c;
    };
    const value = circle('gauge-value');
    value.setAttribute('stroke-dasharray', String(length));
    value.setAttribute('stroke-dashoffset', String(length * (1 - (percent ?? 0) / 100)));
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', `gauge tone-${tone}`);
    svg.setAttribute('viewBox', '0 0 72 72');
    svg.setAttribute('aria-hidden', 'true');
    svg.append(circle('gauge-track'), value);
    return svg;
}

function availabilityTone(percent) {
    if (percent === null) return 'neutral';
    if (percent >= 99) return 'success';
    return percent >= 95 ? 'warning' : 'danger';
}

function renderStats(summary, devices) {
    const counts = summary.devices;
    setText($('statTotal'), counts.total);
    setText($('statTotalSub'), counts.paused ? `${counts.paused} pausado(s)` : '');
    // Mesmo critério da Rede: "online" não inclui quem está em atenção.
    setText($('statOnline'), counts.online);
    setText($('statOnlineSub'), counts.atencao ? `${counts.atencao} em atenção, contados à parte` : '');
    setText($('statOffline'), counts.offline);
    setText($('statOfflineSub'), counts.pendente ? `${counts.pendente} aguardando verificação` : '');
    setText($('statAlerts'), summary.activeAlerts);
    setText($('statLossDevices'), summary.devicesWithActiveLoss);

    const monitored = devices.filter((d) => d.monitoringEnabled);
    setText($('statLatency'), formatLatency(summary.averageLatencyMs));
    renderMetricWithLimit('statLatency', summary.averageLatencyMs, average(monitored.map((d) => d.latencyThresholdMs)), ' ms');
    setText($('statLoss'), formatPercent(summary.averageLoss24hPct));
    renderMetricWithLimit('statLoss', summary.averageLoss24hPct, average(monitored.map((d) => d.lossThresholdPct)), '%');

    const { gateway } = summary;
    const availability = gateway?.availability24h ?? null;
    $('gatewayGauge').replaceChildren(gauge(availability, availabilityTone(availability)));
    if (!gateway) {
        setText($('statGateway'), '—');
        setText($('statGatewaySub'), 'Nenhum dispositivo marcado como gateway');
        return;
    }
    setText($('statGateway'), formatPercent(availability));
    const parts = [gateway.name, gateway.monitoringEnabled ? statusLabel(gateway.status) : 'Pausado'];
    if (gateway.upSince) parts.push(`no ar há ${formatDuration((Date.now() - new Date(gateway.upSince)) / 1000)}`);
    setText($('statGatewaySub'), parts.join(' · '));
}

// ---- Listas -----------------------------------------------------------------------

function categoryRow(c) {
    const percentOf = (n) => (c.total ? (n / c.total) * 100 : 0);
    const details = [`${c.online}/${c.total} online`];
    if (c.atencao) details.push(`${c.atencao} em atenção`);
    if (c.offline) details.push(`${c.offline} offline`);
    if (c.paused) details.push(`${c.paused} pausado(s)`);

    return el('div', { className: 'list-row' }, [
        el('div', { className: 'list-row-head' }, [
            el('span', {}, [el('i', { className: `bi ${c.icon} me-2 text-custom`, attrs: { 'aria-hidden': 'true' } }), c.name]),
            el('span', { className: 'caption', text: details.join(' · ') }),
        ]),
        meter([{ percent: percentOf(c.online), tone: 'success' }, { percent: percentOf(c.atencao), tone: 'warning' }]),
    ]);
}

function latencyRow(d) {
    const percent = d.latencyThresholdMs ? (d.averageLatencyMs / d.latencyThresholdMs) * 100 : 0;
    return el('div', { className: 'list-row latency-row' }, [
        el('span', { className: 'latency-name', text: d.name, attrs: { title: d.name } }),
        meter([{ percent: Math.max(2, percent), tone: levelTone(d.averageLatencyMs, d.latencyThresholdMs) }]),
        el('span', { className: 'caption mono', text: `${formatLatency(d.averageLatencyMs)} / ${d.latencyThresholdMs} ms` }),
    ]);
}

function eventRow(e) {
    const type = EVENT_TYPES[e.type];
    const tone = e.open ? type.tone : 'tone-success';
    return el('div', { className: `alert-item stripe ${tone}` }, [
        el('div', { className: `icon-box icon-box-sm ${tone}`, attrs: { 'aria-hidden': 'true' } }, [el('i', { className: `bi ${type.icon}` })]),
        el('div', { className: 'alert-item-body' }, [
            el('div', { className: 'alert-item-head' }, [
                el('span', { className: 'alert-item-title', text: e.deviceName }),
                badge(e.open ? 'Em andamento' : 'Encerrado', e.open ? 'danger' : 'success'),
            ]),
            el('div', { className: 'text-custom', text: `${type.label} · ${e.text}` }),
            el('div', { className: 'alert-item-meta mono', text: formatDateTime(e.at) }),
        ]),
    ]);
}

// ---- Carga --------------------------------------------------------------------------

async function load() {
    const [summary, events, { devices }, monitor] = await Promise.all([
        api('GET', '/dashboard/summary'), api('GET', '/events?period=0'), api('GET', '/devices'), api('GET', '/monitor/status'),
    ]);

    renderStatusBand(summary, monitor);
    renderStats(summary, devices);

    syncOrEmpty($('categoryList'), summary.categories.filter((c) => c.total > 0), (c) => c.id, categoryRow, {
        icon: 'bi-grid-3x3-gap', title: 'Nenhum dispositivo cadastrado', text: 'Cadastre dispositivos na tela Rede.',
    });

    $('problemsCount').hidden = summary.activeAlerts === 0;
    setText($('problemsCount'), `${summary.activeAlerts} ativo(s)`);
    syncOrEmpty($('openProblems'), summary.recentAlerts, (a) => a.id, (a) => renderAlert(a), {
        icon: 'bi-check-circle', title: 'Nenhum problema aberto', text: 'Todos os dispositivos monitorados estão respondendo normalmente.',
    });

    syncOrEmpty($('latencyList'), summary.latencies, (d) => d.id, latencyRow, {
        icon: 'bi-speedometer', title: 'Sem medições nas últimas 24h', text: 'As latências aparecem depois das primeiras verificações.',
    });

    syncOrEmpty($('recentEvents'), mergeEvents(events).slice(0, RECENT_EVENTS), (e) => e.key, eventRow, {
        icon: 'bi-clock-history', title: 'Nenhum evento nas últimas 24h', text: 'Quedas, picos de latência e perda de pacotes aparecem aqui.',
    });

    state.replaceChildren(); // some o esqueleto de carregamento
    content.hidden = false;
}

startAutoRefresh({ load, area: state, statusEl: $('updateStatus') });
