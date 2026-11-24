// =============================================================================
// layout.js — cabeçalho e menu lateral iguais em todas as páginas internas.
//
// Antes, cada HTML repetia a mesma navbar e o mesmo menu (com "Admin: logado"
// fixo). Agora cada página só chama:
//     const user = await initPage('rede');
// que confere a sessão, monta o layout com o usuário de verdade e libera a página.
// =============================================================================
import { isAdmin, logout, requireAuth } from './auth.js';
import { el } from './ui.js';

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

/** Elementos com data-admin-only somem para quem não é admin. */
export function applyRoleVisibility(user, root = document) {
    for (const element of root.querySelectorAll('[data-admin-only]')) {
        element.hidden = !isAdmin(user);
    }
}

function renderLayout(user, pageKey) {
    const role = el('span', {
        className: `badge ms-2 ${user.role === 'admin' ? 'bg-primary' : 'bg-secondary'}`,
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

    const navbar = el('nav', { className: 'navbar navbar-dark bg-dark mb-4 py-3 border-bottom border-secondary border-opacity-25' }, [
        el('div', { className: 'container-fluid px-4' }, [
            el('div', { className: 'd-flex align-items-center gap-3' }, [
                el('button', {
                    className: 'btn-menu-toggle',
                    attrs: { type: 'button', 'data-bs-toggle': 'offcanvas', 'data-bs-target': '#sidebarMenu', 'aria-controls': 'sidebarMenu', 'aria-label': 'Abrir menu' },
                }, [el('i', { className: 'bi bi-list fs-5' })]),
                el('a', { className: 'navbar-brand mb-0 h1 fs-5 text-decoration-none', attrs: { href: 'dashboard.html' } }, [
                    el('i', { className: 'bi bi-hdd-network me-2' }),
                    'InfraView',
                ]),
            ]),
            el('div', { className: 'd-flex align-items-center' }, [
                el('a', { className: 'text-light me-4 position-relative text-decoration-none', attrs: { href: 'alertas.html', 'aria-label': 'Alertas' } }, [
                    el('i', { className: `bi ${pageKey === 'alertas' ? 'bi-bell-fill' : 'bi-bell'} fs-5` }),
                    // bolinha de alertas ativos: ligada pela etapa que carrega os alertas
                    el('span', { className: 'notif-dot position-absolute top-0 start-100 translate-middle', attrs: { id: 'navAlertDot', hidden: true } }),
                ]),
                el('span', { className: 'text-custom me-4 d-none d-sm-inline' }, [
                    el('i', { className: 'bi bi-person-circle me-1' }),
                    user.name,
                    role,
                ]),
                logoutButton('btn btn-outline-danger btn-sm', 'me-1'),
            ]),
        ]),
    ]);

    const links = PAGES.map((page) =>
        el('a', {
            className: `nav-link${page.key === pageKey ? ' active' : ''}`,
            attrs: { href: page.href, 'aria-current': page.key === pageKey ? 'page' : null },
        }, [
            el('span', {}, [el('i', { className: `bi ${page.icon} nav-icon` }), page.label]),
            page.key === 'alertas'
                ? el('span', { className: 'badge bg-danger rounded-pill badge-count', attrs: { id: 'navAlertCount', hidden: true } })
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
                logoutButton('nav-link text-danger w-100 border-0 bg-transparent text-start', 'nav-icon'),
            ]),
            el('div', { className: 'text-custom small pt-3 border-top border-secondary border-opacity-25' }, [
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
    const retry = el('button', { className: 'btn btn-outline-light btn-sm mt-3', text: 'Tentar de novo', attrs: { type: 'button' } });
    retry.addEventListener('click', () => window.location.reload());
    loader.replaceChildren(
        el('i', { className: 'bi bi-exclamation-octagon text-danger fs-2 mb-2', attrs: { 'aria-hidden': 'true' } }),
        el('div', { className: 'fw-semibold text-light', text: 'Não foi possível abrir a página' }),
        el('div', { className: 'small text-custom', text: err?.message || 'Erro desconhecido.' }),
        retry,
    );
}
