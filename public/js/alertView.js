// =============================================================================
// alertView.js — como desenhar um alerta (usado na tela Alertas e no Dashboard).
// =============================================================================
import { badge, el, formatDateTime } from './ui.js';

/** Tipos de alerta (campo kind da API). */
const ALERT_KINDS = {
    offline: { label: 'Queda', icon: 'bi-wifi-off' },
    latency: { label: 'Latência alta', icon: 'bi-graph-up-arrow' },
    loss: { label: 'Perda de pacotes', icon: 'bi-reception-1' },
    info: { label: 'Informação', icon: 'bi-info-circle' },
};

const STATUS_BADGES = {
    ativo: { label: 'Ativo', tone: 'danger' },
    resolvido: { label: 'Resolvido', tone: 'success' },
    info: { label: 'Info', tone: 'neutral' },
};

const SEVERITY_TONES = { critical: 'tone-danger', warning: 'tone-warning', info: 'tone-primary' };

function iconTone(alert) {
    return alert.status === 'resolvido' ? 'tone-success' : SEVERITY_TONES[alert.severity] ?? 'tone-neutral';
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
        ackLine = el('div', { className: 'alert-ack' }, [
            el('i', { className: 'bi bi-check2-all me-1', attrs: { 'aria-hidden': 'true' } }),
            `Reconhecido por ${alert.acknowledgedBy?.name ?? 'usuário removido'} em ${formatDateTime(alert.acknowledgedAt)}`,
        ]);
    }

    let ackButton = null;
    if (onAcknowledge && alert.status === 'ativo' && !alert.acknowledgedAt) {
        ackButton = el('button', { className: 'btn btn-ghost btn-sm', attrs: { type: 'button', 'data-admin-only': true } }, [
            el('i', { className: 'bi bi-check2 me-1', attrs: { 'aria-hidden': 'true' } }),
            'Reconhecer',
        ]);
        ackButton.addEventListener('click', () => onAcknowledge(alert, ackButton));
    }

    return el('div', { className: 'alert-item' }, [
        el('div', { className: `icon-box icon-box-sm ${iconTone(alert)}`, attrs: { 'aria-hidden': 'true' } }, [el('i', { className: `bi ${kind.icon}` })]),
        el('div', { className: 'alert-item-body' }, [
            el('div', { className: 'alert-item-head' }, [
                el('div', { className: 'alert-item-title', text: alert.title }),
                el('div', { className: 'd-flex align-items-center gap-2' }, [
                    el('span', { className: 'tag', text: kind.label }),
                    badge(status.label, status.tone),
                ]),
            ]),
            alert.message ? el('div', { text: alert.message }) : null,
            el('div', { className: 'alert-item-meta', text: details }),
            ackLine,
        ]),
        ackButton,
    ]);
}
