// =============================================================================
// alertView.js — como desenhar um alerta (usado na tela Alertas e no Dashboard).
// =============================================================================
import { el, formatDateTime } from './ui.js';

/** Tipos de alerta (campo kind da API). */
export const ALERT_KINDS = {
    offline: { label: 'Queda', icon: 'bi-wifi-off' },
    latency: { label: 'Latência alta', icon: 'bi-graph-up-arrow' },
    loss: { label: 'Perda de pacotes', icon: 'bi-reception-1' },
    info: { label: 'Informação', icon: 'bi-info-circle' },
};

const STATUS_BADGES = {
    ativo: { label: 'Ativo', className: 'bg-danger' },
    resolvido: { label: 'Resolvido', className: 'bg-success' },
    info: { label: 'Info', className: 'bg-info text-dark' },
};

function iconClass(alert) {
    if (alert.status === 'resolvido') return 'severity-resolved';
    return `severity-${alert.severity}`; // critical | warning | info
}

/**
 * Um alerta como linha de lista (.alert-item).
 * @param {object}   alert             objeto da API (GET /api/alerts)
 * @param {object}   [options]
 * @param {Function} [options.onAcknowledge] se vier (só para admin), mostra o botão "Reconhecer"
 */
export function renderAlert(alert, { onAcknowledge } = {}) {
    const kind = ALERT_KINDS[alert.kind] ?? ALERT_KINDS.info;
    const status = STATUS_BADGES[alert.status] ?? STATUS_BADGES.info;

    const details = [alert.device.name, alert.device.host, formatDateTime(alert.createdAt)].filter(Boolean).join(' · ');

    let ackLine = null;
    if (alert.acknowledgedAt) {
        ackLine = el('div', { className: 'small text-info mt-1' }, [
            el('i', { className: 'bi bi-check2-all me-1', attrs: { 'aria-hidden': 'true' } }),
            `Reconhecido por ${alert.acknowledgedBy?.name ?? 'usuário removido'} em ${formatDateTime(alert.acknowledgedAt)}`,
        ]);
    }

    let ackButton = null;
    if (onAcknowledge && alert.status === 'ativo' && !alert.acknowledgedAt) {
        ackButton = el('button', { className: 'btn btn-outline-info btn-sm', attrs: { type: 'button', 'data-admin-only': true } }, [
            el('i', { className: 'bi bi-check2 me-1', attrs: { 'aria-hidden': 'true' } }),
            'Reconhecer',
        ]);
        ackButton.addEventListener('click', () => onAcknowledge(alert, ackButton));
    }

    return el('div', { className: 'alert-item' }, [
        el('div', { className: `alert-icon ${iconClass(alert)}`, attrs: { 'aria-hidden': 'true' } }, [el('i', { className: `bi ${kind.icon}` })]),
        el('div', { className: 'flex-grow-1' }, [
            el('div', { className: 'd-flex justify-content-between align-items-start flex-wrap gap-2' }, [
                el('div', { className: 'text-light fw-bold', text: alert.title }),
                el('div', { className: 'd-flex gap-1' }, [
                    el('span', { className: 'badge text-bg-dark border border-secondary', text: kind.label }),
                    el('span', { className: `badge ${status.className}`, text: status.label }),
                ]),
            ]),
            alert.message ? el('div', { className: 'small text-light-emphasis', text: alert.message }) : null,
            el('div', { className: 'text-custom small', text: details }),
            ackLine,
        ]),
        ackButton,
    ]);
}
