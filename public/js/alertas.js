// =============================================================================
// Alertas: lista filtrada por tipo e situação; o admin pode reconhecer os ativos.
//   GET /api/alerts?status=&kind=    PATCH /api/alerts/:id/ack
// =============================================================================
import { api } from './api.js';
import { renderAlert } from './alertView.js';
import { isAdmin } from './auth.js';
import { initPage, startAutoRefresh } from './layout.js';
import { filterPills, setBusy, setText, showError, syncBadges, syncOrEmpty, toast } from './ui.js';

const user = await initPage('alertas');
const admin = isAdmin(user);

const list = document.getElementById('alertList');
const resultsCount = document.getElementById('resultsCount');

const KIND_FILTERS = [
    { value: '', label: 'Todos' },
    { value: 'offline', label: 'Queda' },
    { value: 'latency', label: 'Latência alta' },
    { value: 'loss', label: 'Perda de pacotes' },
];
const STATUS_FILTERS = [
    { value: '', label: 'Todas' },
    { value: 'ativo', label: 'Ativos' },
    { value: 'resolvido', label: 'Resolvidos' },
];

// Mudar o filtro busca de novo na hora (a API filtra).
const currentKind = filterPills(document.getElementById('kindFilter'), KIND_FILTERS, { label: 'Filtrar por tipo', onChange: () => poller.refresh() });
const currentStatus = filterPills(document.getElementById('statusFilter'), STATUS_FILTERS, { label: 'Filtrar por situação', onChange: () => poller.refresh() });

function renderBadges(counts) {
    const badges = [
        { key: 'ativo', className: 'bg-danger', text: `${counts.ativo} ativo(s)` },
        { key: 'resolvido', className: 'bg-success', text: `${counts.resolvido} resolvido(s)` },
    ];
    syncBadges(document.getElementById('alertBadges'), badges);
}

async function acknowledge(alert, button) {
    setBusy(button, true, 'Reconhecendo...');
    try {
        await api('PATCH', `/alerts/${alert.id}/ack`);
        toast(`Alerta "${alert.title}" reconhecido.`);
        poller.refresh();
    } catch (err) {
        showError(err); // ex.: 409 se outro admin reconheceu antes, 403 se não for admin
        setBusy(button, false);
    }
}

async function load() {
    const params = new URLSearchParams();
    if (currentKind()) params.set('kind', currentKind());
    if (currentStatus()) params.set('status', currentStatus());
    const query = params.toString();
    const { alerts, counts } = await api('GET', `/alerts${query ? `?${query}` : ''}`);

    renderBadges(counts);
    const total = counts.ativo + counts.resolvido + counts.info;
    setText(resultsCount, `Exibindo ${alerts.length} de ${total} alerta(s)`);

    const empty = query
        ? { icon: 'bi-funnel', title: 'Nenhum alerta com esses filtros', text: 'Tente outro tipo ou outra situação.' }
        : { icon: 'bi-bell-slash', title: 'Nenhum alerta até agora', text: 'Quando o monitor detectar uma queda, latência alta ou perda de pacotes, o alerta aparece aqui.' };
    syncOrEmpty(list, alerts, (a) => a.id, (a) => renderAlert(a, { onAcknowledge: admin ? acknowledge : undefined }), empty);
}

const poller = startAutoRefresh({ load, area: list, statusEl: document.getElementById('updateStatus') });
