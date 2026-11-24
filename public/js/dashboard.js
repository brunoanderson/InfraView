// =============================================================================
// Dashboard: números e listas calculados pela API, atualizados a cada 10 s.
//   GET /api/dashboard/summary   GET /api/events?period=0 (últimas 24h)
// =============================================================================
import { api } from './api.js';
import { renderAlert } from './alertView.js';
import { EVENT_TYPES, mergeEvents } from './events.js';
import { initPage, startAutoRefresh } from './layout.js';
import { el, formatDateTime, formatDuration, formatLatency, formatPercent, setText, statusLabel, syncOrEmpty, toast } from './ui.js';

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

// ---- Cards de números ----------------------------------------------------------

function renderStats(summary) {
    const { devices, gateway } = summary;
    setText($('statTotal'), devices.total);
    setText($('statTotalSub'), devices.paused ? `${devices.paused} pausado(s)` : '');
    setText($('statOnline'), devices.online + devices.atencao);
    setText($('statOnlineSub'), devices.atencao ? `${devices.atencao} em atenção` : '');
    setText($('statOffline'), devices.offline);
    setText($('statOfflineSub'), devices.pendente ? `${devices.pendente} aguardando verificação` : '');
    setText($('statAlerts'), summary.activeAlerts);
    setText($('statLatency'), formatLatency(summary.averageLatencyMs));
    setText($('statLoss'), formatPercent(summary.averageLoss24hPct));
    setText($('statLossDevices'), summary.devicesWithActiveLoss);

    if (!gateway) {
        setText($('statGateway'), '—');
        setText($('statGatewaySub'), 'Nenhum dispositivo marcado como gateway');
        return;
    }
    setText($('statGateway'), formatPercent(gateway.availability24h));
    const parts = [gateway.name, gateway.monitoringEnabled ? statusLabel(gateway.status) : 'Pausado'];
    if (gateway.upSince) parts.push(`no ar há ${formatDuration((Date.now() - new Date(gateway.upSince)) / 1000)}`);
    setText($('statGatewaySub'), parts.join(' · '));
}

// ---- Listas -----------------------------------------------------------------------

function categoryRow(c) {
    const up = c.online + c.atencao; // respondendo
    const percent = c.total ? Math.round((up / c.total) * 100) : 0;
    const details = [`${up}/${c.total} online`];
    if (c.atencao) details.push(`${c.atencao} em atenção`);
    if (c.offline) details.push(`${c.offline} offline`);
    if (c.paused) details.push(`${c.paused} pausado(s)`);

    const fill = el('div', { className: `fill ${c.atencao ? 'bg-warning' : 'bg-success'}` });
    // Largura por propriedade CSS (permitido pela CSP; atributo style="..." não é)
    fill.style.setProperty('--w', `${percent}%`);
    fill.style.width = `${percent}%`;

    return el('div', { className: 'category-row' }, [
        el('div', { className: 'd-flex justify-content-between align-items-center mb-2 gap-2' }, [
            el('span', { className: 'text-light small' }, [el('i', { className: `bi ${c.icon} me-2 text-custom`, attrs: { 'aria-hidden': 'true' } }), c.name]),
            el('span', { className: 'text-custom small text-end', text: details.join(' · ') }),
        ]),
        el('div', {
            className: 'category-progress',
            attrs: { role: 'progressbar', 'aria-label': `${c.name}: ${percent}% online`, 'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        }, [fill]),
    ]);
}

function latencyRow(d) {
    const ratio = d.latencyThresholdMs ? d.averageLatencyMs / d.latencyThresholdMs : 0;
    const level = ratio > 1 ? ' crit' : ratio > 0.7 ? ' warn' : '';
    const fill = el('div', { className: `latency-fill${level}` });
    const width = `${Math.max(2, Math.min(100, Math.round(ratio * 100)))}%`;
    fill.style.setProperty('--w', width);
    fill.style.width = width;
    return el('div', { className: 'latency-row' }, [
        el('span', { className: 'text-light small latency-name', text: d.name, attrs: { title: d.name } }),
        el('div', { className: 'latency-track', attrs: { 'aria-hidden': 'true' } }, [fill]),
        el('span', { className: 'text-custom small latency-value', text: `${formatLatency(d.averageLatencyMs)} / ${d.latencyThresholdMs} ms` }),
    ]);
}

function eventRow(e) {
    const type = EVENT_TYPES[e.type];
    return el('div', { className: 'alert-item' }, [
        el('div', { className: `alert-icon ${e.open ? type.iconClass : 'severity-resolved'}`, attrs: { 'aria-hidden': 'true' } }, [el('i', { className: `bi ${type.icon}` })]),
        el('div', { className: 'flex-grow-1' }, [
            el('div', { className: 'd-flex justify-content-between flex-wrap gap-2' }, [
                el('span', { className: 'text-light small fw-bold', text: e.deviceName }),
                el('span', { className: `badge ${e.open ? 'bg-danger' : 'bg-success'}`, text: e.open ? 'Em andamento' : 'Encerrado' }),
            ]),
            el('div', { className: 'text-custom small', text: `${type.label} · ${e.text}` }),
            el('div', { className: 'text-custom small', text: formatDateTime(e.at) }),
        ]),
    ]);
}

// ---- Carga --------------------------------------------------------------------------

async function load() {
    const [summary, events] = await Promise.all([api('GET', '/dashboard/summary'), api('GET', '/events?period=0')]);

    renderStats(summary);

    syncOrEmpty($('categoryList'), summary.categories.filter((c) => c.total > 0), (c) => c.id, categoryRow, {
        icon: 'bi-grid-3x3-gap', title: 'Nenhum dispositivo cadastrado', text: 'Cadastre dispositivos na tela Rede.',
    });

    const problems = summary.recentAlerts;
    $('problemsCount').hidden = summary.activeAlerts === 0;
    setText($('problemsCount'), `${summary.activeAlerts} ativo(s)`);
    syncOrEmpty($('openProblems'), problems, (a) => a.id, (a) => renderAlert(a), {
        icon: 'bi-check-circle', title: 'Nenhum problema aberto', text: 'Todos os dispositivos monitorados estão respondendo normalmente.',
    });

    syncOrEmpty($('latencyList'), summary.latencies, (d) => d.id, latencyRow, {
        icon: 'bi-speedometer', title: 'Sem medições nas últimas 24h', text: 'As latências aparecem depois das primeiras verificações.',
    });

    syncOrEmpty($('recentEvents'), mergeEvents(events).slice(0, RECENT_EVENTS), (e) => e.key, eventRow, {
        icon: 'bi-clock-history', title: 'Nenhum evento nas últimas 24h', text: 'Quedas, picos de latência e perda de pacotes aparecem aqui.',
    });

    state.replaceChildren(); // some o "Carregando..."
    content.hidden = false;
}

startAutoRefresh({ load, area: state, statusEl: $('updateStatus') });
