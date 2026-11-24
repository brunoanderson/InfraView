// =============================================================================
// Rede: dispositivos por categoria, com busca, filtro por status e, para o
// admin, cadastro/edição (modal), pausar/retomar, excluir e "verificar agora".
//   GET  /api/devices   GET /api/categories
//   POST /api/devices   PUT /api/devices/:id   DELETE /api/devices/:id
//   POST /api/devices/:id/check
// =============================================================================
import { api } from './api.js';
import { isAdmin } from './auth.js';
import {
    checkTypeText, DEVICE_ICONS, latencyClass, latencyText, lossClass, lossText, toRequestBody, validateDevice,
} from './devices.js';
import { initPage, startAutoRefresh } from './layout.js';
import {
    clearFieldErrors, closeModal, confirmDialog, el, filterPills, formatRelative, formatTime, hideFormMessage, setBusy,
    setFieldError, setText, showEmpty, showError, showFieldErrors, showFormMessage, statusBadge, statusLabel, syncBadges,
    syncChildren, tableShell, toast,
} from './ui.js';

const user = await initPage('rede');
const admin = isAdmin(user);

const list = document.getElementById('deviceList');
const resultsCount = document.getElementById('resultsCount');
const searchInput = document.getElementById('deviceSearch');

let devices = [];
let categories = [];
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

const cards = new Map(); // categoria -> { card, count, tbody }

function categoryCard(category) {
    if (cards.has(category.id)) return cards.get(category.id);
    const headers = [
        { label: 'Dispositivo', className: 'ps-4' }, 'Host', 'Verificação', 'Status',
        { label: 'Latência média', className: 'text-nowrap' }, 'Perda', 'Última verificação',
    ];
    if (admin) headers.push({ label: 'Ações', className: 'pe-4 text-end' });
    const { wrapper, tbody } = tableShell(headers, { caption: `Dispositivos da categoria ${category.name}` });
    const count = el('span', { className: 'badge bg-secondary' });
    const card = el('section', { className: 'card shadow-sm mb-4', attrs: { 'aria-label': category.name } }, [
        el('div', { className: 'card-header bg-transparent d-flex justify-content-between align-items-center py-3' }, [
            el('h2', { className: 'h6 mb-0 text-light' }, [el('i', { className: `bi ${category.icon} me-2 text-custom`, attrs: { 'aria-hidden': 'true' } }), category.name]),
            count,
        ]),
        el('div', { className: 'card-body p-0' }, [wrapper]),
    ]);
    const entry = { card, count, tbody };
    cards.set(category.id, entry);
    return entry;
}

function deviceRow(d) {
    const offline = d.monitoringEnabled && d.status === 'offline';
    const nameCell = el('td', { className: 'ps-4' }, [
        el('div', { className: 'd-flex align-items-center gap-2' }, [
            el('span', { className: 'device-type-icon', attrs: { 'aria-hidden': 'true' } }, [el('i', { className: `bi ${d.icon}` })]),
            el('div', {}, [
                el('div', { className: 'text-light' }, [
                    d.name,
                    d.isGateway ? el('span', { className: 'badge bg-primary bg-opacity-25 text-primary ms-2', text: 'Gateway' }) : null,
                ]),
                d.model ? el('div', { className: 'small text-custom', text: d.model }) : null,
            ]),
        ]),
    ]);

    let note = d.statusNote;
    if (!d.monitoringEnabled) note = 'Monitoramento pausado';
    else if (d.status === 'pendente' && !note) note = 'Aguardando a primeira verificação';

    const cells = [
        nameCell,
        el('td', { className: 'font-monospace-ip', text: d.host }),
        el('td', { className: 'text-custom text-nowrap', text: checkTypeText(d) }),
        el('td', {}, [statusBadge(d.status, d.monitoringEnabled), note ? el('div', { className: 'small text-custom mt-1', text: note }) : null]),
        el('td', { className: `text-nowrap ${latencyClass(d)}`, text: latencyText(d) }),
        el('td', { className: `text-nowrap ${lossClass(d)}`, text: lossText(d) }),
        el('td', { className: `text-nowrap ${offline ? 'text-danger' : 'text-custom'}` }, [
            el('div', { text: d.lastCheckAt ? formatTime(d.lastCheckAt) : '—' }),
            offline && d.lastSeenAt ? el('div', { className: 'small', text: `última resposta ${formatRelative(d.lastSeenAt)}` }) : null,
        ]),
    ];
    if (admin) cells.push(el('td', { className: 'pe-4 text-end text-nowrap' }, [actionButtons(d)]));

    return el('tr', { className: offline ? 'table-danger-row' : '' }, cells);
}

function iconButton(icon, label, onClick, variant = 'outline-secondary') {
    const button = el('button', { className: `btn btn-sm btn-${variant}`, attrs: { type: 'button', title: label, 'aria-label': label } }, [
        el('i', { className: `bi ${icon}`, attrs: { 'aria-hidden': 'true' } }),
    ]);
    button.addEventListener('click', () => onClick(button));
    return button;
}

function actionButtons(d) {
    return el('div', { className: 'btn-group', attrs: { role: 'group', 'aria-label': `Ações de ${d.name}` } }, [
        iconButton('bi-arrow-repeat', `Verificar ${d.name} agora`, (b) => checkNow(d, b)),
        d.monitoringEnabled
            ? iconButton('bi-pause-fill', `Pausar ${d.name}`, (b) => toggleMonitoring(d, b))
            : iconButton('bi-play-fill', `Retomar ${d.name}`, (b) => toggleMonitoring(d, b)),
        iconButton('bi-pencil', `Editar ${d.name}`, () => openForm(d)),
        iconButton('bi-trash', `Excluir ${d.name}`, (b) => removeDevice(d, b), 'outline-danger'),
    ]);
}

function renderBadges() {
    const counts = { online: 0, atencao: 0, offline: 0, pausado: 0 };
    for (const d of devices) counts[situationOf(d)] = (counts[situationOf(d)] ?? 0) + 1;
    const badges = [
        ['online', 'bg-success', 'online'],
        ['atencao', 'bg-warning text-dark', 'em atenção'],
        ['offline', 'bg-danger', 'offline'],
        ['pausado', 'badge-paused', 'pausado(s)'],
    ].filter(([key]) => counts[key] > 0).map(([key, className, label]) => ({ key, className, text: `${counts[key]} ${label}` }));
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
            text: admin ? 'Clique em "Novo dispositivo" para começar a monitorar.' : 'Peça a um administrador para cadastrar os dispositivos.',
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
        syncChildren(entry.tbody, rows, (d) => d.id, deviceRow);
        shown.push(entry.card);
    }
    const same = shown.length === list.children.length && shown.every((card, i) => list.children[i] === card);
    if (!same) list.replaceChildren(...shown);
}

// ---- Carga e atualização automática -------------------------------------------

async function load() {
    const [devicesRes, categoriesRes] = await Promise.all([api('GET', '/devices'), api('GET', '/categories')]);
    devices = devicesRes.devices;
    categories = categoriesRes.categories;
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
