// =============================================================================
// Relatórios: eventos registrados pelo monitor, com filtros de período,
// dispositivo e tipo.
//   GET /api/events?type=&period=&device=    GET /api/devices (opções do filtro)
//
// Só as quedas têm duração: picos de latência e de perda guardam o início, o
// pior valor e se já foram resolvidos (a API não registra quando terminaram).
// =============================================================================
import { api } from './api.js';
import { initPage, startAutoRefresh } from './layout.js';
import { el, formatDateTime, formatDuration, formatLatency, setText, syncChildren, tableShell } from './ui.js';

await initPage('relatorios');

const $ = (id) => document.getElementById(id);
const filters = $('filters');
const state = $('reportState');

// Cada tipo de evento: card, tabela (montada uma vez) e como desenhar a linha.
const SECTIONS = {
    downtime: {
        card: $('downtimeCard'), count: $('downtimeCount'), types: ['todos', 'downtime'],
        headers: [{ label: 'Dispositivo', className: 'ps-4' }, 'Início', 'Fim', 'Duração', { label: 'Motivo', className: 'pe-4' }],
        empty: 'Nenhuma queda no período.',
        row: (e) => el('tr', { className: e.ongoing ? 'table-danger-row' : '' }, [
            deviceCell(e),
            el('td', { className: 'text-nowrap', text: formatDateTime(e.startedAt) }),
            el('td', { className: 'text-nowrap' }, [e.ongoing ? el('span', { className: 'badge bg-danger', text: 'Em andamento' }) : formatDateTime(e.endedAt)]),
            el('td', { className: `text-nowrap ${e.ongoing ? 'text-danger' : ''}`, text: formatDuration(e.durationSeconds) }),
            el('td', { className: 'pe-4 text-custom', text: e.reason ?? '—' }),
        ]),
    },
    latency: {
        card: $('latencyCard'), count: $('latencyCount'), types: ['todos', 'latencia'],
        headers: [{ label: 'Dispositivo', className: 'ps-4' }, 'Início', 'Pior média', 'Limite', { label: 'Situação', className: 'pe-4' }],
        empty: 'Nenhum pico de latência no período.',
        row: (e) => el('tr', {}, [
            deviceCell(e),
            el('td', { className: 'text-nowrap', text: formatDateTime(e.recordedAt) }),
            el('td', { className: 'text-nowrap text-warning', text: formatLatency(e.latencyMs) }),
            el('td', { className: 'text-nowrap text-custom', text: formatLatency(e.thresholdMs) }),
            el('td', { className: 'pe-4' }, [situationBadge(e.resolved)]),
        ]),
    },
    loss: {
        card: $('lossCard'), count: $('lossCount'), types: ['todos', 'perda'],
        headers: [{ label: 'Dispositivo', className: 'ps-4' }, 'Início', 'Maior perda', 'Limite', { label: 'Situação', className: 'pe-4' }],
        empty: 'Nenhuma perda de pacotes acima do limite no período.',
        row: (e) => el('tr', {}, [
            deviceCell(e),
            el('td', { className: 'text-nowrap', text: formatDateTime(e.recordedAt) }),
            el('td', { className: 'text-nowrap text-warning', text: `${e.lossPct}%` }),
            el('td', { className: 'text-nowrap text-custom', text: `${e.thresholdPct}%` }),
            el('td', { className: 'pe-4' }, [situationBadge(e.resolved)]),
        ]),
    },
};

function deviceCell(e) {
    return el('td', { className: 'ps-4' }, [
        el('div', { className: 'text-light', text: e.deviceName }),
        el('div', { className: 'small font-monospace-ip text-custom', text: e.deviceHost }),
    ]);
}

function situationBadge(resolved) {
    return el('span', { className: `badge ${resolved ? 'bg-success' : 'bg-danger'}`, text: resolved ? 'Resolvido' : 'Ativo' });
}

for (const [key, section] of Object.entries(SECTIONS)) {
    const { wrapper, tbody } = tableShell(section.headers, { caption: section.card.querySelector('h2').textContent });
    section.tbody = tbody;
    section.emptyRow = el('tr', {}, [el('td', { className: 'text-center text-custom py-4', text: section.empty, attrs: { colspan: section.headers.length } })]);
    $(`${key}Table`).append(wrapper);
}

// ---- Opções do filtro de dispositivo ----------------------------------------

let deviceOptionsKey = '';
function renderDeviceOptions(devices) {
    const key = devices.map((d) => `${d.id}:${d.name}`).join('|');
    if (key === deviceOptionsKey) return; // não mexe no select se nada mudou
    deviceOptionsKey = key;
    const select = $('filterDevice');
    const selected = select.value;
    select.replaceChildren(
        el('option', { text: 'Todos os dispositivos', attrs: { value: '' } }),
        ...devices.map((d) => el('option', { text: d.name, attrs: { value: d.id } })),
    );
    // Se o dispositivo escolhido foi excluído, volta para "todos".
    select.value = devices.some((d) => String(d.id) === selected) ? selected : '';
}

// ---- Carga --------------------------------------------------------------------

async function load() {
    const params = new URLSearchParams({ type: filters.elements.type.value, period: filters.elements.period.value });
    if (filters.elements.device.value) params.set('device', filters.elements.device.value);
    const [events, { devices }] = await Promise.all([api('GET', `/events?${params}`), api('GET', '/devices')]);

    renderDeviceOptions(devices);

    const lists = { downtime: events.downtime, latency: events.latency, loss: events.loss };
    for (const [key, section] of Object.entries(SECTIONS)) {
        const shown = section.types.includes(events.type);
        section.card.hidden = !shown;
        if (!shown) continue;
        const items = lists[key];
        setText(section.count, items.length);
        if (items.length === 0) section.tbody.replaceChildren(section.emptyRow);
        else syncChildren(section.tbody, items, (e) => e.id, section.row);
    }

    // Resumo: quantos eventos de cada tipo e tempo total fora do ar
    const parts = [];
    if (SECTIONS.downtime.types.includes(events.type)) {
        const totalDown = events.downtime.reduce((sum, e) => sum + e.durationSeconds, 0);
        parts.push(`${events.downtime.length} queda(s)${events.downtime.length ? `, ${formatDuration(totalDown)} fora do ar no total` : ''}`);
    }
    if (SECTIONS.latency.types.includes(events.type)) parts.push(`${events.latency.length} pico(s) de latência`);
    if (SECTIONS.loss.types.includes(events.type)) parts.push(`${events.loss.length} período(s) com perda de pacotes`);
    setText($('eventSummary'), parts.join(' · '));

    state.replaceChildren(); // some o "Carregando..."
}

const poller = startAutoRefresh({ load, area: state, statusEl: $('updateStatus') });
filters.addEventListener('change', () => poller.refresh());
filters.addEventListener('submit', (event) => event.preventDefault());
