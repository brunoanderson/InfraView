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
import { badge, el, emptyTableRow, formatDateTime, formatDuration, formatLatency, setText, syncChildren, tableShell } from './ui.js';

await initPage('relatorios');

const $ = (id) => document.getElementById(id);
const filters = $('filters');
const state = $('reportState');

// Cada tipo de evento: card, colunas, células da linha e frase de "nada no período".
const SECTIONS = {
    downtime: {
        card: $('downtimeCard'), count: $('downtimeCount'), types: ['todos', 'downtime'],
        columns: ['Dispositivo', 'Início', 'Fim', 'Duração', 'Motivo'],
        empty: 'Nenhuma queda no período.',
        rowClass: (e) => (e.ongoing ? 'is-down' : ''),
        cells: (e) => [
            deviceCell(e),
            el('td', { className: 'mono', text: formatDateTime(e.startedAt) }),
            el('td', { className: 'mono' }, [e.ongoing ? badge('Em andamento', 'danger') : formatDateTime(e.endedAt)]),
            el('td', { className: `mono ${e.ongoing ? 'text-danger' : ''}`, text: formatDuration(e.durationSeconds) }),
            el('td', { className: 'text-custom', text: e.reason ?? '—' }),
        ],
    },
    latency: {
        card: $('latencyCard'), count: $('latencyCount'), types: ['todos', 'latencia'],
        columns: ['Dispositivo', 'Início', 'Pior média', 'Limite', 'Situação'],
        empty: 'Nenhum pico de latência no período.',
        rowClass: () => '',
        cells: (e) => [
            deviceCell(e),
            el('td', { className: 'mono', text: formatDateTime(e.recordedAt) }),
            el('td', { className: 'mono text-warning', text: formatLatency(e.latencyMs) }),
            el('td', { className: 'mono text-custom', text: formatLatency(e.thresholdMs) }),
            el('td', {}, [situationBadge(e.resolved)]),
        ],
    },
    loss: {
        card: $('lossCard'), count: $('lossCount'), types: ['todos', 'perda'],
        columns: ['Dispositivo', 'Início', 'Maior perda', 'Limite', 'Situação'],
        empty: 'Nenhuma perda de pacotes acima do limite no período.',
        rowClass: () => '',
        cells: (e) => [
            deviceCell(e),
            el('td', { className: 'mono', text: formatDateTime(e.recordedAt) }),
            el('td', { className: 'mono text-warning', text: `${e.lossPct}%` }),
            el('td', { className: 'mono text-custom', text: `${e.thresholdPct}%` }),
            el('td', {}, [situationBadge(e.resolved)]),
        ],
    },
};

function deviceCell(e) {
    return el('td', { className: 'cell-title' }, [
        el('div', { className: 'device-name', text: e.deviceName }),
        el('div', { className: 'device-model mono', text: e.deviceHost }),
    ]);
}

function situationBadge(resolved) {
    return resolved ? badge('Resolvido', 'success') : badge('Ativo', 'danger');
}

for (const [key, section] of Object.entries(SECTIONS)) {
    const { wrapper, tbody, row } = tableShell(section.columns, { caption: section.card.querySelector('h2').textContent });
    section.tbody = tbody;
    section.render = (e) => row(section.cells(e), section.rowClass(e));
    section.emptyRow = emptyTableRow(section.empty, section.columns.length);
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
        else syncChildren(section.tbody, items, (e) => e.id, section.render);
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

    state.replaceChildren(); // some o esqueleto de carregamento
}

const poller = startAutoRefresh({ load, area: state, statusEl: $('updateStatus') });
filters.addEventListener('change', () => poller.refresh());
filters.addEventListener('submit', (event) => event.preventDefault());
