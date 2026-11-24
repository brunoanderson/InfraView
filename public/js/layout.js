// =============================================================================
// layout.js — cabeçalho e menu lateral iguais em todas as páginas internas.
//
// Antes, cada HTML repetia a mesma navbar e o mesmo menu (com "Admin: logado"
// fixo). Agora cada página só chama:
//     const user = await initPage('rede');
// que confere a sessão, monta o layout com o usuário de verdade e libera a página.
// =============================================================================
import { api } from './api.js';
import { isAdmin, logout, requireAuth } from './auth.js';
import { createPoller } from './poller.js';
import { el, formatTime, setText, showErrorState, showLoading } from './ui.js';

const PAGES = [
    { key: 'dashboard', href: 'dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard' },
    { key: 'alertas', href: 'alertas.html', icon: 'bi-bell', label: 'Alertas' },
    { key: 'rede', href: 'rede.html', icon: 'bi-diagram-3', label: 'Rede' },
    { key: 'relatorios', href: 'relatorios.html', icon: 'bi-file-earmark-bar-graph', label: 'Relatórios e Logs' },
];

const ROLE_LABELS = { admin: 'Admin', viewer: 'Visualizador' };

/**
 * Prepara uma página protegida: exige login, monta o layout e mostra o conteúdo.
 * Se o servidor estiver fora do ar, mostra o erro com um botão para tentar de novo.
 * @param {string} pageKey  dashboard | alertas | rede | relatorios
 * @returns o usuário logado
 */
export async function initPage(pageKey) {
    let user;
    try {
        user = await requireAuth();
    } catch (err) {
        showBootError(err);
        throw err; // interrompe o script da página
    }
    renderLayout(user, pageKey);
    applyRoleVisibility(user);
    document.body.classList.add('is-ready');
    return user;
}

/**
 * Sino e contador de alertas ativos na navbar e no menu. Cada página chama
 * esta função no mesmo poller que atualiza os seus dados.
 */
async function refreshNavAlerts() {
    const { counts } = await api('GET', '/alerts?status=ativo');
    const active = counts.ativo;
    const dot = document.getElementById('navAlertDot');
    const badge = document.getElementById('navAlertCount');
    if (dot) {
        dot.hidden = active === 0;
        dot.parentElement.setAttribute('aria-label', active ? `Alertas: ${active} ativo(s)` : 'Alertas: nenhum ativo');
    }
    if (badge) {
        badge.hidden = active === 0;
        setText(badge, active);
    }
}

/**
 * Atualização automática de uma tela (a cada 10 s, pelo poller.js), com os
 * estados de carregando e erro já resolvidos:
 *   - 1ª carga: esqueleto de carregamento em `area`; se falhar, erro com "Tentar novamente".
 *   - Atualizações seguintes: os dados na tela ficam; se uma falhar, só o
 *     `statusEl` avisa ("Falha ao atualizar...") e a próxima tenta de novo.
 *   - Também atualiza o sino de alertas da navbar.
 * @param {object}   options
 * @param {Function} options.load     async: busca os dados e desenha a tela
 * @param {Element}  options.area     onde aparecem o "carregando" e o erro da 1ª carga
 * @param {Element}  [options.statusEl] onde aparece "Atualizado às 14:05:32"
 * @returns o poller (use poller.refresh() depois de salvar algo)
 */
export function startAutoRefresh({ load, area, statusEl }) {
    let loaded = false;
    const poller = createPoller(async () => {
        refreshNavAlerts().catch(() => {}); // o sino não pode derrubar a tela
        try {
            await load();
            loaded = true;
            if (statusEl) {
                statusEl.classList.remove('text-warning');
                setText(statusEl, `Atualizado às ${formatTime(new Date().toISOString())}`);
            }
        } catch (err) {
            if (!loaded) {
                showErrorState(area, err, () => {
                    showLoading(area);
                    poller.refresh();
                });
            } else if (statusEl) {
                statusEl.classList.add('text-warning');
                setText(statusEl, `Falha ao atualizar às ${formatTime(new Date().toISOString())}: ${err.message}`);
            }
            throw err;
        }
    });
    showLoading(area);
    poller.start();
    return poller;
}

/** Elementos com data-admin-only somem para quem não é admin. */
function applyRoleVisibility(user, root = document) {
    for (const element of root.querySelectorAll('[data-admin-only]')) {
        element.hidden = !isAdmin(user);
    }
}

function renderLayout(user, pageKey) {
    const role = el('span', {
        className: `tag ms-2 ${user.role === 'admin' ? 'tag-primary' : ''}`,
        text: ROLE_LABELS[user.role] ?? user.role,
    });

    // Ícone e texto dentro de um <span>, como nos links do menu (o menu separa os filhos nas pontas).
    const logoutButton = (className, iconClass) => {
        const button = el('button', { className, attrs: { type: 'button' } }, [
            el('span', {}, [el('i', { className: `bi bi-box-arrow-right ${iconClass}`, attrs: { 'aria-hidden': 'true' } }), 'Sair']),
        ]);
        button.addEventListener('click', logout);
        return button;
    };

    const navbar = el('nav', { className: 'navbar app-navbar' }, [
        el('div', { className: 'container-fluid px-4' }, [
            el('div', { className: 'd-flex align-items-center gap-2' }, [
                el('button', {
                    className: 'btn btn-ghost btn-icon',
                    attrs: { type: 'button', 'data-bs-toggle': 'offcanvas', 'data-bs-target': '#sidebarMenu', 'aria-controls': 'sidebarMenu', 'aria-label': 'Abrir menu' },
                }, [el('i', { className: 'bi bi-list fs-5', attrs: { 'aria-hidden': 'true' } })]),
                el('a', { className: 'navbar-brand mb-0 fs-5 text-decoration-none', attrs: { href: 'dashboard.html' } }, [
                    el('i', { className: 'bi bi-hdd-network me-2', attrs: { 'aria-hidden': 'true' } }),
                    'InfraView',
                ]),
            ]),
            el('div', { className: 'd-flex align-items-center gap-3' }, [
                el('a', { className: 'nav-icon-link', attrs: { href: 'alertas.html', 'aria-label': 'Alertas' } }, [
                    el('i', { className: `bi ${pageKey === 'alertas' ? 'bi-bell-fill' : 'bi-bell'}`, attrs: { 'aria-hidden': 'true' } }),
                    // bolinha de "há alertas ativos": refreshNavAlerts() mostra ou esconde
                    el('span', { className: 'notif-dot', attrs: { id: 'navAlertDot', hidden: true } }),
                ]),
                el('span', { className: 'navbar-user d-none d-sm-inline' }, [
                    el('i', { className: 'bi bi-person-circle me-1', attrs: { 'aria-hidden': 'true' } }),
                    user.name,
                    role,
                ]),
                logoutButton('btn btn-ghost is-danger btn-sm', 'me-1'),
            ]),
        ]),
    ]);

    const links = PAGES.map((page) =>
        el('a', {
            className: `nav-link${page.key === pageKey ? ' active' : ''}`,
            attrs: { href: page.href, 'aria-current': page.key === pageKey ? 'page' : null },
        }, [
            el('span', {}, [el('i', { className: `bi ${page.icon} nav-icon`, attrs: { 'aria-hidden': 'true' } }), page.label]),
            page.key === 'alertas'
                ? el('span', { className: 'nav-count', attrs: { id: 'navAlertCount', hidden: true } })
                : null,
        ]),
    );

    const sidebar = el('div', {
        className: 'offcanvas offcanvas-start offcanvas-dark text-light',
        attrs: { tabindex: '-1', id: 'sidebarMenu', 'aria-labelledby': 'sidebarMenuLabel' },
    }, [
        el('div', { className: 'offcanvas-header' }, [
            el('span', { className: 'offcanvas-title fw-bold', attrs: { id: 'sidebarMenuLabel' } }, [
                el('i', { className: 'bi bi-hdd-network me-2' }),
                'InfraView',
            ]),
            el('button', { className: 'btn-close btn-close-white', attrs: { type: 'button', 'data-bs-dismiss': 'offcanvas', 'aria-label': 'Fechar' } }),
        ]),
        el('div', { className: 'offcanvas-body d-flex flex-column' }, [
            el('nav', { className: 'sidebar-nav flex-grow-1' }, [
                ...links,
                el('div', { className: 'nav-divider' }),
                logoutButton('nav-link is-danger w-100 border-0 bg-transparent text-start', 'nav-icon'),
            ]),
            el('div', { className: 'sidebar-footer' }, [
                'Conectado como ',
                el('span', { className: 'text-light', text: user.email }),
            ]),
        ]),
    ]);

    document.body.prepend(navbar, sidebar);
}

/** Falha ao confirmar a sessão (ex.: servidor fora do ar): mostra no lugar do "carregando". */
function showBootError(err) {
    const loader = document.querySelector('.page-loader');
    if (!loader) return;
    const retry = el('button', { className: 'btn btn-ghost btn-sm mt-3', text: 'Tentar novamente', attrs: { type: 'button' } });
    retry.addEventListener('click', () => window.location.reload());
    loader.replaceChildren(
        el('i', { className: 'bi bi-exclamation-octagon text-danger fs-2 mb-2', attrs: { 'aria-hidden': 'true' } }),
        el('div', { className: 'empty-state-title', text: 'Não foi possível abrir a página' }),
        el('div', { text: err?.message || 'Erro desconhecido.' }),
        retry,
    );
}
