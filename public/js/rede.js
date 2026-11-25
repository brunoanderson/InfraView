// =============================================================================
// Rede: dispositivos por categoria, com busca, filtro por status, gráfico de
// latência e, para o admin, cadastro/edição (modal), pausar/retomar, excluir e
// "verificar agora".
//   GET  /api/devices   GET /api/categories   GET /api/devices/measurements
//   POST /api/devices   PUT /api/devices/:id   DELETE /api/devices/:id
//   POST /api/devices/:id/check
// =============================================================================
import { api } from './api.js';
import { isAdmin } from './auth.js';
import {
    checkTypeText, DEVICE_ICONS, latencyClass, latencyPercentOfLimit, latencyText, latencyTone, lossClass, lossText, toRequestBody,
    validateDevice,
} from './devices.js';
import { initPage, startAutoRefresh } from './layout.js';
import {
    clearFieldErrors, closeModal, confirmDialog, el, filterPills, hideFormMessage, iconButton, meter, relativeTime, setBusy,
    setFieldError, setText, showEmpty, showError, showFieldErrors, showFormMessage, sparkline, statusBadge, statusLabel, syncBadges,
    statusTone, syncChildren, tableShell, toast,
} from './ui.js';

const user = await initPage('rede');
const admin = isAdmin(user);

const list = document.getElementById('deviceList');
const resultsCount = document.getElementById('resultsCount');
const searchInput = document.getElementById('deviceSearch');

const HISTORY_SIZE = 30; // verificações no gráfico de cada dispositivo

let devices = [];
let categories = [];
let histories = {}; // id do dispositivo -> últimas verificações
let search = '';

// ---- Filtros ---------------------------------------------------------------

const STATUS_FILTERS = [
    { value: 'todos', label: 'Todos' },
    { value: 'online', label: 'Online' },
    { value: 'atencao', label: 'Atenção' },
    { value: 'offline', label: 'Offline' },
    { value: 'pendente', label: 'Pendente' },
    { value: 'pausado', label: 'Pausado' },
];

const currentFilter = filterPills(document.getElementById('statusFilter'), STATUS_FILTERS, {
    label: 'Filtrar por status',
    onChange: render,
});

searchInput.addEventListener('input', () => {
    search = searchInput.value.trim().toLowerCase();
    render();
});

/** Situação usada pelo filtro: pausado vale mais que o status medido. */
const situationOf = (d) => (d.monitoringEnabled ? d.status : 'pausado');

function matches(device) {
    const filter = currentFilter();
    if (filter !== 'todos' && situationOf(device) !== filter) return false;
    if (!search) return true;
    return [device.name, device.host, device.model, device.category.name].some((v) => v?.toLowerCase().includes(search));
}

// ---- Desenho -----------------------------------------------------------------

const cards = new Map(); // categoria -> { card, count, tbody, row }

const COLUMNS = [
    { label: 'Dispositivo', className: 'col-device' },
    { label: 'Host', className: 'col-host' },
    { label: 'Verificação', className: 'col-check' },
    { label: 'Status', className: 'col-status' },
    { label: 'Latência', className: 'col-latency' },
    { label: 'Perda', className: 'col-loss' },
    { label: 'Histórico', className: 'col-history' },
    { label: 'Última verificação', className: 'col-last' },
    ...(admin ? [{ label: 'Ações', className: 'col-actions text-end' }] : []),
];

function categoryCard(category) {
    if (cards.has(category.id)) return cards.get(category.id);
    const { wrapper, tbody, row } = tableShell(COLUMNS, { className: 'devices-table', caption: `Dispositivos da categoria ${category.name}` });
    const count = el('span', { className: 'count-badge' });
    const card = el('section', { className: 'card mb-4', attrs: { 'aria-label': category.name } }, [
        el('div', { className: 'card-header' }, [
            el('h2', { className: 'section-title' }, [el('i', { className: `bi ${category.icon} me-2 text-custom`, attrs: { 'aria-hidden': 'true' } }), category.name]),
            count,
        ]),
        el('div', { className: 'card-body p-0' }, [wrapper]),
    ]);
    const entry = { card, count, tbody, row };
    cards.set(category.id, entry);
    return entry;
}

function statusNote(d) {
    if (!d.monitoringEnabled) return 'Monitoramento pausado';
    if (d.status === 'pendente' && !d.statusNote) return 'Aguardando a primeira verificação';
    return d.statusNote;
}

function deviceRow(d, row) {
    const offline = d.monitoringEnabled && d.status === 'offline';
    const note = statusNote(d);
    const cells = [
        el('td', { className: 'cell-title' }, [
            el('div', { className: 'd-flex align-items-center gap-3' }, [
                el('span', { className: 'icon-box icon-box-sm', attrs: { 'aria-hidden': 'true' } }, [el('i', { className: `bi ${d.icon}` })]),
                el('div', { className: 'min-w-0' }, [
                    el('div', { className: 'device-name' }, [d.name, d.isGateway ? el('span', { className: 'tag tag-accent ms-2', text: 'Gateway' }) : null]),
                    d.model ? el('div', { className: 'device-model', text: d.model }) : null,
                ]),
            ]),
        ]),
        el('td', { className: 'mono', text: d.host }),
        el('td', { className: 'text-custom', text: checkTypeText(d) }),
        el('td', {}, [el('div', {}, [statusBadge(d.status, d.monitoringEnabled), note ? el('div', { className: 'status-note', text: note }) : null])]),
        el('td', {}, [el('div', { className: 'latency-cell' }, [
            el('span', { className: `mono ${latencyClass(d)}`, text: latencyText(d) }),
            meter([{ percent: latencyPercentOfLimit(d), tone: latencyTone(d) }]),
        ])]),
        el('td', { className: `mono ${lossClass(d)}`, text: lossText(d) }),
        el('td', {}, [d.history.length ? sparkline(d.history, { limitMs: d.latencyThresholdMs, tone: latencyTone(d) }) : el('span', { className: 'caption', text: 'sem medições' })]),
        el('td', { className: offline ? 'text-danger' : 'text-custom' }, [
            el('div', {}, [
                el('div', {}, [relativeTime(d.lastCheckAt)]),
                offline && d.lastSeenAt ? el('div', { className: 'status-note' }, ['última resposta ', relativeTime(d.lastSeenAt)]) : null,
            ]),
        ]),
    ];
    if (admin) cells.push(el('td', { className: 'cell-actions text-end' }, [actionButtons(d)]));
    return row(cells, `stripe tone-${statusTone(situationOf(d))}${offline ? ' is-down' : ''}`);
}

function actionButtons(d) {
    return el('div', { className: 'row-actions', attrs: { role: 'group', 'aria-label': `Ações de ${d.name}` } }, [
        iconButton('bi-arrow-repeat', `Verificar ${d.name} agora`, (b) => checkNow(d, b)),
        d.monitoringEnabled
            ? iconButton('bi-pause-fill', `Pausar ${d.name}`, (b) => toggleMonitoring(d, b))
            : iconButton('bi-play-fill', `Retomar ${d.name}`, (b) => toggleMonitoring(d, b)),
        iconButton('bi-pencil', `Editar ${d.name}`, () => openForm(d)),
        iconButton('bi-trash', `Excluir ${d.name}`, (b) => removeDevice(d, b), { danger: true }),
    ]);
}

// Mesmo critério do Dashboard: "online" não inclui quem está em atenção.
const SITUATION_BADGES = [
    ['online', 'success', 'online'],
    ['atencao', 'warning', 'em atenção'],
    ['offline', 'danger', 'offline'],
    ['pendente', 'neutral', 'pendente(s)'],
    ['pausado', 'paused', 'pausado(s)'],
];

function renderBadges() {
    const counts = {};
    for (const d of devices) counts[situationOf(d)] = (counts[situationOf(d)] ?? 0) + 1;
    const badges = SITUATION_BADGES.filter(([key]) => counts[key] > 0)
        .map(([key, tone, label]) => ({ key, tone, text: `${counts[key]} ${label}` }));
    syncBadges(document.getElementById('statusBadges'), badges);
}

function render() {
    renderBadges();
    const visible = devices.filter(matches);
    setText(resultsCount, `Exibindo ${visible.length} de ${devices.length} dispositivo(s)`);

    if (devices.length === 0) {
        cards.clear();
        showEmpty(list, {
            icon: 'bi-hdd-network',
            title: 'Nenhum dispositivo cadastrado',
            text: admin ? 'Cadastre o primeiro para começar a monitorar.' : 'Peça a um admin para cadastrar os dispositivos.',
            action: admin ? { label: 'Cadastrar dispositivo', onClick: () => openForm() } : undefined,
        });
        return;
    }
    if (visible.length === 0) {
        cards.clear();
        showEmpty(list, { icon: 'bi-search', title: 'Nenhum dispositivo encontrado', text: 'Tente outro filtro ou outro termo de busca.' });
        return;
    }

    const shown = [];
    for (const category of categories) {
        const rows = visible.filter((d) => d.category.id === category.id);
        if (rows.length === 0) continue;
        const entry = categoryCard(category);
        setText(entry.count, `${rows.length} dispositivo(s)`);
        const withHistory = rows.map((d) => ({ ...d, history: histories[d.id] ?? [] }));
        syncChildren(entry.tbody, withHistory, (d) => d.id, (d) => deviceRow(d, entry.row));
        shown.push(entry.card);
    }
    const same = shown.length === list.children.length && shown.every((card, i) => list.children[i] === card);
    if (!same) list.replaceChildren(...shown);
}

// ---- Carga e atualização automática -------------------------------------------

async function load() {
    const [devicesRes, categoriesRes, measurementsRes] = await Promise.all([
        api('GET', '/devices'), api('GET', '/categories'), api('GET', `/devices/measurements?limit=${HISTORY_SIZE}`),
    ]);
    devices = devicesRes.devices;
    categories = categoriesRes.categories;
    histories = measurementsRes.measurements;
    render();
}

const poller = startAutoRefresh({ load, area: list, statusEl: document.getElementById('updateStatus') });

// ---- Ações (só admin; o back-end recusa as outras com 403) ---------------------

async function checkNow(d, button) {
    button.disabled = true;
    try {
        const { device, checked } = await api('POST', `/devices/${d.id}/check`);
        if (!checked) {
            toast(`${d.name} já estava sendo verificado; o resultado aparece em instantes.`, 'info');
        } else {
            const result = device.status === 'offline' || device.status === 'pendente'
                ? device.statusNote ?? 'sem resposta'
                : `latência ${latencyText(device)}, perda ${lossText(device)}`;
            toast(`${device.name} verificado: ${result}.`, device.status === 'online' ? 'success' : 'warning');
        }
        poller.refresh();
    } catch (err) {
        showError(err);
    } finally {
        button.disabled = false;
    }
}

async function toggleMonitoring(d, button) {
    button.disabled = true;
    try {
        const resume = !d.monitoringEnabled;
        await api('PUT', `/devices/${d.id}`, toRequestBody(d, { monitoringEnabled: resume }));
        toast(resume ? `Monitoramento de ${d.name} retomado.` : `Monitoramento de ${d.name} pausado.`, 'info');
        poller.refresh();
    } catch (err) {
        showError(err);
        button.disabled = false;
    }
}

async function removeDevice(d, button) {
    const confirmed = await confirmDialog({
        title: 'Excluir dispositivo',
        message: `Excluir ${d.name} (${d.host})? O histórico de verificações, quedas, picos e alertas dele também será apagado.`,
        confirmText: 'Excluir',
        danger: true,
    });
    if (!confirmed) return;
    button.disabled = true;
    try {
        await api('DELETE', `/devices/${d.id}`);
        toast(`${d.name} foi excluído.`);
        poller.refresh();
    } catch (err) {
        showError(err);
        button.disabled = false;
    }
}

// ---- Modal de cadastro/edição --------------------------------------------------

const modalElement = document.getElementById('deviceModal');
const form = document.getElementById('deviceForm');
const formMessage = document.getElementById('deviceFormMessage');
const saveButton = document.getElementById('deviceSaveButton');
const portGroup = document.getElementById('portGroup');
const modal = new window.bootstrap.Modal(modalElement);
const field = (name) => form.elements.namedItem(name);
let editing = null; // dispositivo em edição (null = novo)

field('icon').replaceChildren(...DEVICE_ICONS.map((i) => el('option', { text: i.label, attrs: { value: i.value } })));

/** Porta só existe para tcp/http. */
function syncPortField() {
    const usesPort = field('checkType').value !== 'ping';
    portGroup.hidden = !usesPort;
    field('port').required = usesPort;
}
field('checkType').addEventListener('change', syncPortField);

function openForm(device = null) {
    editing = device;
    form.reset();
    clearFieldErrors(form);
    hideFormMessage(formMessage);
    setText(document.getElementById('deviceModalTitle'), device ? `Editar ${device.name}` : 'Novo dispositivo');

    field('categoryId').replaceChildren(...categories.map((c) => el('option', { text: c.name, attrs: { value: c.id } })));
    const d = device ?? { name: '', model: '', host: '', checkType: 'ping', port: null, latencyThresholdMs: 100, lossThresholdPct: 20,
        category: { id: categories[0]?.id }, icon: 'bi-router', isGateway: false, monitoringEnabled: true };
    field('name').value = d.name;
    field('model').value = d.model ?? '';
    field('host').value = d.host;
    field('checkType').value = d.checkType;
    field('port').value = d.port ?? '';
    field('latencyThresholdMs').value = d.latencyThresholdMs;
    field('lossThresholdPct').value = d.lossThresholdPct;
    field('categoryId').value = d.category.id;
    field('icon').value = DEVICE_ICONS.some((i) => i.value === d.icon) ? d.icon : 'bi-hdd';
    field('isGateway').checked = d.isGateway;
    field('monitoringEnabled').checked = d.monitoringEnabled;
    syncPortField();
    modal.show();
}

document.getElementById('newDeviceButton').addEventListener('click', () => openForm());
modalElement.addEventListener('shown.bs.modal', () => field('name').focus());

/** Lê o formulário no formato da API (números convertidos; vazio = null). */
function readForm() {
    const num = (name) => (field(name).value.trim() === '' ? null : Number(field(name).value));
    const checkType = field('checkType').value;
    return {
        name: field('name').value.trim(),
        model: field('model').value.trim() || null,
        host: field('host').value.trim(),
        checkType,
        port: checkType === 'ping' ? null : num('port'),
        latencyThresholdMs: num('latencyThresholdMs'),
        lossThresholdPct: num('lossThresholdPct'),
        categoryId: num('categoryId'),
        icon: field('icon').value,
        isGateway: field('isGateway').checked,
        monitoringEnabled: field('monitoringEnabled').checked,
    };
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    hideFormMessage(formMessage);

    const body = readForm();
    const errors = validateDevice(body);
    for (const [name, message] of Object.entries(errors)) setFieldError(field(name), message);
    if (Object.keys(errors).length) {
        form.querySelector('.is-invalid').focus();
        return;
    }

    setBusy(saveButton, true, editing ? 'Salvando...' : 'Cadastrando e verificando...');
    try {
        const { device } = editing
            ? await api('PUT', `/devices/${editing.id}`, body)
            : await api('POST', '/devices', body);
        closeModal(modalElement);
        const measured = device.monitoringEnabled ? ` Status medido: ${statusLabel(device.status)}.` : '';
        toast(`${device.name} ${editing ? 'atualizado' : 'cadastrado'}.${measured}`);
        poller.refresh();
    } catch (err) {
        if (err.status === 400 && showFieldErrors(form, err.details)) {
            form.querySelector('.is-invalid')?.focus();
        } else if (err.status === 409 && Array.isArray(err.details?.fields)) {
            // nome repetido ou mesmo host + tipo + porta
            const first = err.details.fields.map(field).find(Boolean);
            if (first) {
                setFieldError(first, err.message);
                first.focus();
            }
        } else if (err.status === 403) {
            showError(err);
        } else {
            showFormMessage(formMessage, err.message);
        }
    } finally {
        setBusy(saveButton, false);
    }
});
