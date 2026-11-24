// =============================================================================
// Dashboard: números e listas calculados pela API, atualizados a cada 10 s.
//   GET /api/dashboard/summary   GET /api/events?period=0 (últimas 24h)
// =============================================================================
import { api } from './api.js';
import { renderAlert } from './alertView.js';
import { EVENT_TYPES, mergeEvents } from './events.js';
import { initPage, startAutoRefresh } from './layout.js';
import { badge, el, formatDateTime, formatDuration, formatLatency, formatPercent, setText, statusLabel, syncOrEmpty, toast } from './ui.js';

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
    // Mesmo critério da Rede: "online" não inclui quem está em atenção.
    setText($('statOnline'), devices.online);
    setText($('statOnlineSub'), devices.atencao ? `${devices.atencao} em atenção, contados à parte` : '');
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

/** Pedaço de barra com a largura em % (style.width pelo JS é permitido pela CSP; o atributo style="..." não). */
function barSegment(className, percent) {
    const segment = el('span', { className });
    segment.style.width = `${percent}%`;
    return segment;
}

function categoryRow(c) {
    const percentOf = (n) => (c.total ? Math.round((n / c.total) * 100) : 0);
    const details = [`${c.online}/${c.total} online`];
    if (c.atencao) details.push(`${c.atencao} em atenção`);
    if (c.offline) details.push(`${c.offline} offline`);
    if (c.paused) details.push(`${c.paused} pausado(s)`);

    return el('div', { className: 'list-row' }, [
        el('div', { className: 'list-row-head' }, [
            el('span', {}, [el('i', { className: `bi ${c.icon} me-2 text-custom`, attrs: { 'aria-hidden': 'true' } }), c.name]),
            el('span', { className: 'caption', text: details.join(' · ') }),
        ]),
        el('div', { className: 'stacked-bar', attrs: { role: 'img', 'aria-label': `${c.name}: ${details.join(', ')}` } }, [
            barSegment('bar-success', percentOf(c.online)),
            barSegment('bar-warning', percentOf(c.atencao)),
        ]),
    ]);
}

function latencyRow(d) {
    const ratio = d.latencyThresholdMs ? d.averageLatencyMs / d.latencyThresholdMs : 0;
    const level = ratio > 1 ? 'bar-danger' : ratio > 0.7 ? 'bar-warning' : 'bar-success';
    return el('div', { className: 'latency-row' }, [
        el('span', { className: 'latency-name', text: d.name, attrs: { title: d.name } }),
        el('div', { className: 'stacked-bar', attrs: { 'aria-hidden': 'true' } }, [barSegment(level, Math.max(2, Math.min(100, Math.round(ratio * 100))))]),
        el('span', { className: 'caption latency-value', text: `${formatLatency(d.averageLatencyMs)} / ${d.latencyThresholdMs} ms` }),
    ]);
}

function eventRow(e) {
    const type = EVENT_TYPES[e.type];
    return el('div', { className: 'alert-item' }, [
        el('div', { className: `icon-box icon-box-sm ${e.open ? type.tone : 'tone-success'}`, attrs: { 'aria-hidden': 'true' } }, [el('i', { className: `bi ${type.icon}` })]),
        el('div', { className: 'alert-item-body' }, [
            el('div', { className: 'alert-item-head' }, [
                el('span', { className: 'alert-item-title', text: e.deviceName }),
                badge(e.open ? 'Em andamento' : 'Encerrado', e.open ? 'danger' : 'success'),
            ]),
            el('div', { className: 'text-custom', text: `${type.label} · ${e.text}` }),
            el('div', { className: 'alert-item-meta', text: formatDateTime(e.at) }),
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

    state.replaceChildren(); // some o esqueleto de carregamento
    content.hidden = false;
}

startAutoRefresh({ load, area: state, statusEl: $('updateStatus') });
