// =============================================================================
// ui.js — peças de interface reaproveitadas por todas as páginas.
//
// Regra de segurança: dados que vêm da API entram na página só como TEXTO
// (textContent ou nós de texto), nunca como HTML (innerHTML). Assim, um nome de
// dispositivo como "<img onerror=...>" aparece escrito, em vez de virar código
// (proteção contra XSS).
// =============================================================================

/**
 * Cria um elemento. Filhos podem ser elementos ou textos (textos viram nós de
 * texto, então são sempre seguros).
 *   el('span', { className: 'status-badge tone-success', text: 'Online' })
 *   el('a', { attrs: { href: 'rede.html' } }, [el('i', { className: 'bi bi-wifi' }), ' Rede'])
 */
export function el(tag, { className, text, attrs } = {}, children = []) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    for (const [name, value] of Object.entries(attrs ?? {})) {
        if (value !== undefined && value !== null && value !== false) element.setAttribute(name, value === true ? '' : value);
    }
    element.append(...children.filter((child) => child !== null && child !== undefined));
    return element;
}

// ---- Avisos ---------------------------------------------------------------

let toastRegion;
const TOAST_ICONS = { success: 'bi-check-circle', danger: 'bi-x-circle', warning: 'bi-exclamation-triangle', info: 'bi-info-circle' };

/** Aviso discreto no canto da tela, lido pelos leitores de tela. type: success | danger | warning | info */
export function toast(message, type = 'success') {
    toastRegion ??= document.body.appendChild(el('div', { className: 'toast-region', attrs: { 'aria-live': 'polite' } }));
    const close = el('button', { className: 'btn-close btn-close-white', attrs: { type: 'button', 'aria-label': 'Fechar aviso' } });
    const item = el('div', { className: `app-toast app-toast-${type}` }, [
        el('i', { className: `bi ${TOAST_ICONS[type]}`, attrs: { 'aria-hidden': 'true' } }),
        el('span', { className: 'app-toast-text', text: message }),
        close,
    ]);
    const timer = setTimeout(() => item.remove(), type === 'danger' ? 7000 : 4000);
    close.addEventListener('click', () => {
        clearTimeout(timer);
        item.remove();
    });
    toastRegion.append(item);
}

/** Mostra um erro da API (ApiError) como aviso. 403 vira "sem permissão" (amarelo). */
export function showError(err) {
    if (err?.status === 403) {
        toast(err.message || 'Você não tem permissão para esta ação.', 'warning');
    } else {
        toast(err?.message || 'Algo deu errado. Tente novamente.', 'danger');
    }
}

// ---- Estados de uma área da página --------------------------------------

/** Esqueleto de carregamento dentro de `container` (o texto fica para leitores de tela). */
export function showLoading(container, { lines = 4 } = {}) {
    container.replaceChildren(
        el('div', { className: 'skeleton', attrs: { role: 'status' } }, [
            el('span', { className: 'visually-hidden', text: 'Carregando...' }),
            ...Array.from({ length: lines }, () => el('div', { className: 'skeleton-line', attrs: { 'aria-hidden': 'true' } })),
        ]),
    );
}

/**
 * Estado vazio: ícone, frase e, se fizer sentido, um botão de ação.
 * @param action { label, onClick } opcional
 */
export function showEmpty(container, { icon = 'bi-inbox', title = 'Nada por aqui', text = '', action } = {}) {
    container.replaceChildren(
        el('div', { className: 'empty-state', attrs: { 'data-title': title } }, [
            el('i', { className: `bi ${icon} empty-state-icon`, attrs: { 'aria-hidden': 'true' } }),
            el('div', { className: 'empty-state-title', text: title }),
            text ? el('div', { text }) : null,
            action ? actionButton(action) : null,
        ]),
    );
}

function actionButton({ label, onClick, className = 'btn btn-primary btn-sm' }) {
    const button = el('button', { className, text: label, attrs: { type: 'button' } });
    button.addEventListener('click', onClick);
    return button;
}

/**
 * Lista que pode ficar vazia: sem itens, mostra o estado vazio (só redesenha se
 * a mensagem mudou); com itens, sincroniza item a item (syncChildren).
 */
export function syncOrEmpty(container, items, keyOf, render, empty) {
    if (items.length > 0) {
        syncChildren(container, items, keyOf, render);
        return;
    }
    const current = container.querySelector(':scope > .empty-state');
    if (current?.dataset.title !== empty.title) showEmpty(container, empty);
}

/** Selos de contagem no topo das telas: [{ key, tone, text }]. */
export function syncBadges(container, badges) {
    syncChildren(container, badges, (b) => b.key, (b) => badge(b.text, b.tone));
}

/** Erro numa área, com o botão "Tentar novamente" opcional. */
export function showErrorState(container, err, onRetry) {
    container.replaceChildren(
        el('div', { className: 'empty-state', attrs: { role: 'alert' } }, [
            el('i', { className: 'bi bi-exclamation-octagon empty-state-icon is-error', attrs: { 'aria-hidden': 'true' } }),
            el('div', { className: 'empty-state-title', text: 'Não foi possível carregar' }),
            el('div', { text: err?.message || 'Erro desconhecido.' }),
            onRetry ? actionButton({ label: 'Tentar novamente', onClick: onRetry, className: 'btn btn-ghost btn-sm' }) : null,
        ]),
    );
}

/** Botão "ocupado" durante um envio: desabilita e mostra um spinner. */
export function setBusy(button, busy, busyText = 'Enviando...') {
    if (busy) {
        button.dataset.idleText ??= button.textContent.trim();
        button.disabled = true;
        button.replaceChildren(
            el('span', { className: 'spinner-border spinner-border-sm me-2', attrs: { 'aria-hidden': 'true' } }),
            busyText,
        );
    } else {
        button.disabled = false;
        button.textContent = button.dataset.idleText ?? button.textContent;
    }
}

// ---- Mensagem geral de um formulário (o <div class="alert"> do topo) ------

export function showFormMessage(element, text, type = 'danger') {
    element.className = `alert alert-${type}`;
    element.textContent = text;
}

export function hideFormMessage(element) {
    element.className = 'alert d-none';
    element.textContent = '';
}

// ---- Erros por campo nos formulários ------------------------------------

/** Marca um campo como inválido, com a mensagem embaixo dele. */
export function setFieldError(input, message) {
    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    let feedback = input.parentElement.querySelector('.invalid-feedback');
    if (!feedback) {
        feedback = el('div', { className: 'invalid-feedback' });
        input.parentElement.append(feedback);
    }
    feedback.textContent = message;
}

export function clearFieldErrors(form) {
    for (const input of form.querySelectorAll('.is-invalid')) {
        input.classList.remove('is-invalid');
        input.removeAttribute('aria-invalid');
    }
}

/**
 * Mostra os erros que a API devolveu em details: [{ field, message }].
 * Devolve quantos campos do formulário foram marcados.
 */
export function showFieldErrors(form, details) {
    let marked = 0;
    for (const { field, message } of Array.isArray(details) ? details : []) {
        const input = form.elements.namedItem(field);
        if (input) {
            setFieldError(input, message);
            marked++;
        }
    }
    return marked;
}

// ---- Formatação ----------------------------------------------------------
// A API manda datas em ISO UTC (ex.: 2026-11-24T13:05:00.000Z); o navegador
// converte para o fuso de quem está vendo.

/** timeStyle 'medium' inclui os segundos. */
export function formatDateTime(iso, timeStyle = 'short') {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle });
}

/** Só a hora, com segundos (ex.: "verificado às 14:05:32"). */
export function formatTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('pt-BR');
}

/** "há 12 s", "há 3 min", "há 2h 05min"... */
export function formatRelative(iso, now = Date.now()) {
    if (!iso) return '—';
    const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    return seconds < 1 ? 'agora' : `há ${formatDuration(seconds)}`;
}

/** Segundos -> "45 s", "12 min", "3h 05min", "2d 04h". */
export function formatDuration(totalSeconds) {
    if (totalSeconds === null || totalSeconds === undefined) return '—';
    const s = Math.max(0, Math.round(totalSeconds));
    if (s < 60) return `${s} s`;
    const minutes = Math.floor(s / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}min`;
    return `${Math.floor(hours / 24)}d ${String(hours % 24).padStart(2, '0')}h`;
}

/** Latência: null -> "—", 0 -> "<1 ms" (o ping mede em ms inteiros). */
export function formatLatency(ms) {
    if (ms === null || ms === undefined) return '—';
    return ms === 0 ? '<1 ms' : `${ms} ms`;
}

/** Porcentagem: null -> "—". */
export function formatPercent(value) {
    if (value === null || value === undefined) return '—';
    return `${value}%`;
}

/** Perda de pacotes em %: null -> "—". */
export function formatLoss(pct) {
    return formatPercent(pct);
}

const STATUS = {
    online: { label: 'Online', tone: 'success' },
    atencao: { label: 'Em atenção', tone: 'warning' },
    offline: { label: 'Offline', tone: 'danger' },
    pendente: { label: 'Pendente', tone: 'neutral' },
    pausado: { label: 'Pausado', tone: 'paused' },
};

/** Nome do status para mostrar em texto ("atencao" -> "Em atenção"). */
export function statusLabel(status, monitoringEnabled = true) {
    return (STATUS[monitoringEnabled ? status : 'pausado'] ?? { label: status }).label;
}

/** Selo com ponto colorido e texto. tone: success | warning | danger | neutral | paused */
export function badge(text, tone) {
    return el('span', { className: `status-badge tone-${tone}`, text });
}

/** Selo do status de um dispositivo. Dispositivo pausado aparece como "Pausado". */
export function statusBadge(status, monitoringEnabled = true) {
    const info = STATUS[monitoringEnabled ? status : 'pausado'] ?? { label: status, tone: 'neutral' };
    return badge(info.label, info.tone);
}

// ---- Tempo relativo que se atualiza sozinho ------------------------------------

/** <time> com "há 12 s" e o horário completo no title. */
export function relativeTime(iso) {
    if (!iso) return el('span', { text: '—' });
    return el('time', { text: formatRelative(iso), attrs: { datetime: iso, title: formatDateTime(iso, 'medium'), 'data-relative': true } });
}

/**
 * Atualiza os "há N s" de `root`: as linhas que não mudaram são reaproveitadas
 * (syncChildren), então o texto delas precisa ser refeito a cada atualização.
 */
export function refreshRelativeTimes(root) {
    const now = Date.now();
    for (const time of root.querySelectorAll('time[data-relative]')) setText(time, formatRelative(time.dateTime, now));
}

// ---- Tabelas ------------------------------------------------------------------

/**
 * Tabela com cabeçalho fixo e um <tbody> para preencher. Em telas pequenas, o
 * CSS mostra cada linha como cartão, com o rótulo da coluna ao lado do valor.
 * @param headers textos ou [{ label, className }]  className vai no <th> (ex.: largura da coluna)
 * @returns { wrapper, tbody, row } row(cells, className) monta um <tr> com os rótulos
 */
export function tableShell(headers, { className = '', caption } = {}) {
    const columns = headers.map((h) => (typeof h === 'string' ? { label: h } : h));
    const tbody = el('tbody');
    // Descrição para leitores de tela via aria-label (um <caption> escondido
    // transbordava 1 px e fazia aparecer uma barra de rolagem vertical).
    const table = el('table', { className: `table table-hover align-middle data-table ${className}`, attrs: { 'aria-label': caption } }, [
        el('thead', {}, [
            el('tr', {}, columns.map((c) => el('th', { className: c.className, text: c.label, attrs: { scope: 'col' } }))),
        ]),
        tbody,
    ]);

    // A célula com .cell-title vira o título do cartão e a .cell-actions, o rodapé: sem rótulo.
    function row(cells, rowClass = '') {
        cells.forEach((cell, i) => {
            if (!cell.matches('.cell-title, .cell-actions')) cell.dataset.label = columns[i].label;
        });
        return el('tr', { className: rowClass }, cells);
    }

    return { wrapper: el('div', { className: 'table-responsive' }, [table]), tbody, row };
}

/** Linha única de "nada no período", ocupando todas as colunas. */
export function emptyTableRow(text, columnCount) {
    return el('tr', {}, [el('td', { className: 'table-empty', text, attrs: { colspan: columnCount } })]);
}

// ---- Atualização sem piscar ----------------------------------------------

/** Troca o texto só se ele mudou (evita mexer no DOM a cada atualização). */
export function setText(element, text) {
    const value = String(text ?? '');
    if (element.textContent !== value) element.textContent = value;
}

const fingerprints = new WeakMap();

/**
 * Sincroniza os filhos de `container` com a lista `items`, item a item:
 * reaproveita o elemento de quem não mudou e só recria o que mudou. Usado nas
 * tabelas e listas que se atualizam a cada 10 s, para a tela não piscar.
 * @param keyOf  (item) => chave única (ex.: id)
 * @param render (item) => elemento que representa o item
 */
export function syncChildren(container, items, keyOf, render) {
    const previous = new Map();
    for (const child of container.children) {
        if (child.dataset.key !== undefined) previous.set(child.dataset.key, child);
    }
    const nodes = items.map((item) => {
        const key = String(keyOf(item));
        const fingerprint = JSON.stringify(item);
        const existing = previous.get(key);
        if (existing && fingerprints.get(existing) === fingerprint) return existing;
        const node = render(item);
        node.dataset.key = key;
        fingerprints.set(node, fingerprint);
        return node;
    });
    // Só mexe na ordem/no conteúdo se algo realmente mudou.
    const same = nodes.length === container.children.length && nodes.every((node, i) => container.children[i] === node);
    if (!same) container.replaceChildren(...nodes);
}

// ---- Filtros em "pílulas" ---------------------------------------------------

/**
 * Grupo de botões de filtro (só um ativo). Devolve uma função que lê o valor atual.
 * @param options [{ value, label }]
 */
export function filterPills(container, options, { initial, label, onChange }) {
    let current = initial ?? options[0].value;
    container.setAttribute('role', 'group');
    if (label) container.setAttribute('aria-label', label);
    const buttons = options.map(({ value, label: text }) => {
        const button = el('button', { className: 'filter-pill', text, attrs: { type: 'button', 'data-value': value } });
        button.addEventListener('click', () => {
            if (current === value) return;
            current = value;
            paint();
            onChange(value);
        });
        return button;
    });
    function paint() {
        for (const button of buttons) {
            const active = button.dataset.value === current;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        }
    }
    container.replaceChildren(...buttons);
    paint();
    return () => current;
}

// ---- Modais do Bootstrap ---------------------------------------------------------

// Marca quais modais já terminaram de abrir. (Só no navegador: os testes do
// Node importam este arquivo para usar as funções de formatação.)
if (typeof document !== 'undefined') {
    document.addEventListener('shown.bs.modal', (event) => { event.target.dataset.opened = 'true'; });
    document.addEventListener('hide.bs.modal', (event) => { delete event.target.dataset.opened; });
}

/**
 * Fecha um modal mesmo que ele ainda esteja abrindo: o Bootstrap ignora hide()
 * durante a animação de abertura, e uma resposta rápida da API deixaria o
 * modal aberto.
 */
export function closeModal(element) {
    const modal = window.bootstrap.Modal.getOrCreateInstance(element);
    if (element.classList.contains('show') && element.dataset.opened !== 'true') {
        element.addEventListener('shown.bs.modal', () => modal.hide(), { once: true });
    } else {
        modal.hide();
    }
}

// ---- Confirmação (modal do Bootstrap) ----------------------------------------

let dialogCount = 0;

/**
 * Pergunta antes de uma ação (ex.: excluir). Usa o modal do Bootstrap, que já
 * prende o foco dentro dele e fecha com Esc. Resolve true se confirmar.
 */
export function confirmDialog({ title, message, confirmText = 'Confirmar', danger = false }) {
    return new Promise((resolve) => {
        const titleId = `confirmTitle${++dialogCount}`;
        const cancel = el('button', { className: 'btn btn-ghost', text: 'Cancelar', attrs: { type: 'button', 'data-bs-dismiss': 'modal' } });
        const confirm = el('button', { className: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: confirmText, attrs: { type: 'button' } });
        const dialog = el('div', { className: 'modal fade', attrs: { tabindex: '-1', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId } }, [
            el('div', { className: 'modal-dialog modal-dialog-centered' }, [
                el('div', { className: 'modal-content' }, [
                    el('div', { className: 'modal-header' }, [
                        el('h2', { className: 'modal-title fs-5', text: title, attrs: { id: titleId } }),
                        el('button', { className: 'btn-close', attrs: { type: 'button', 'data-bs-dismiss': 'modal', 'aria-label': 'Fechar' } }),
                    ]),
                    el('div', { className: 'modal-body', text: message }),
                    el('div', { className: 'modal-footer' }, [cancel, confirm]),
                ]),
            ]),
        ]);
        let confirmed = false;
        confirm.addEventListener('click', () => {
            confirmed = true;
            closeModal(dialog);
        });
        // Foco no "Cancelar": numa ação destrutiva, Enter sem querer não exclui nada.
        dialog.addEventListener('shown.bs.modal', () => cancel.focus());
        dialog.addEventListener('hidden.bs.modal', () => {
            modal.dispose();
            dialog.remove();
            resolve(confirmed);
        });
        document.body.append(dialog);
        const modal = new window.bootstrap.Modal(dialog);
        modal.show();
    });
}
