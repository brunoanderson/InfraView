/**
 * ui/dashboard.js
 * ------------------------------------------------------------------
 * Dashboard: indicadores, disponibilidade por categoria e tabela de offline.
 * Sem fetch, sem innerHTML: só createElement / textContent /
 * classList / setAttribute / appendChild.
 * ------------------------------------------------------------------
 */

import { ORDEM_CATEGORIAS, limparElemento, criarElemento, criarLinhaVazia, criarCelulaTexto, ordenarPorDataDesc, formatarDataHora } from './helpers.js';
import { criarBadgeStatus, descreverCategoriaModelo } from './dispositivos.js';

/** Ícone (Bootstrap Icons) de cada categoria. */
const ICONES_CATEGORIA = {
    'Rede Wi-Fi': 'bi-wifi',
    'Segurança': 'bi-camera-video',
    'Energia': 'bi-sun',
    'Outros': 'bi-pc-display',
};

/**
 * Calcula todos os números exibidos no Dashboard a partir dos dados
 * brutos da API. Função pura: não toca no DOM.
 * @param {Array<object>} dispositivos
 * @param {Array<object>} alertas
 */
export function calcularResumoDashboard(dispositivos, alertas) {
    const lista = dispositivos || [];
    const online = lista.filter((d) => d.status === 'up');
    const total = lista.length;

    // Latência é só informativa. Dispositivos com 0 ms ainda não têm medição.
    const medicoes = online.map((d) => Number(d.latencia_ms)).filter((ms) => ms > 0);
    const latenciaMedia = medicoes.length
        ? Math.round(medicoes.reduce((soma, ms) => soma + ms, 0) / medicoes.length)
        : null;

    return {
        total,
        online: online.length,
        offline: total - online.length,
        alertasAtivos: (alertas || []).filter((a) => a.status === 'ativo').length,
        disponibilidade: total ? Math.round((online.length / total) * 100) : 0,
        latenciaMedia,
        categorias: agruparPorCategoria(lista),
    };
}

function agruparPorCategoria(dispositivos) {
    const mapa = new Map();
    dispositivos.forEach((d) => {
        const nome = d.categoria || 'Outros';
        if (!mapa.has(nome)) {
            mapa.set(nome, { categoria: nome, total: 0, online: 0, offline: 0 });
        }
        const grupo = mapa.get(nome);
        grupo.total += 1;
        if (d.status === 'up') {
            grupo.online += 1;
        } else {
            grupo.offline += 1;
        }
    });

    const indice = (nome) => {
        const posicao = ORDEM_CATEGORIAS.indexOf(nome);
        return posicao === -1 ? ORDEM_CATEGORIAS.length : posicao;
    };
    return [...mapa.values()].sort((a, b) => indice(a.categoria) - indice(b.categoria));
}

/**
 * Desenha as duas fileiras de cartões de indicadores do Dashboard.
 * @param {ReturnType<typeof calcularResumoDashboard>} resumo
 * @param {HTMLElement} linhaPrincipal
 * @param {HTMLElement} linhaSecundaria
 */
export function renderizarIndicadoresDashboard(resumo, linhaPrincipal, linhaSecundaria) {
    const wifi = resumo.categorias.find((c) => c.categoria === 'Rede Wi-Fi') || { total: 0, online: 0 };
    const seguranca = resumo.categorias.find((c) => c.categoria === 'Segurança') || { total: 0, offline: 0 };

    desenharIndicadores(linhaPrincipal, [
        { rotulo: 'Total de Dispositivos', valor: String(resumo.total), icone: 'bi-hdd-network', cor: 'info' },
        { rotulo: 'Dispositivos Online', valor: String(resumo.online), icone: 'bi-check-circle', cor: 'success' },
        { rotulo: 'Dispositivos Offline', valor: String(resumo.offline), icone: 'bi-x-circle', cor: 'danger' },
        { rotulo: 'Alertas Ativos', valor: String(resumo.alertasAtivos), icone: 'bi-exclamation-triangle', cor: 'warning' },
    ]);

    desenharIndicadores(linhaSecundaria, [
        { rotulo: 'Disponibilidade Geral', valor: `${resumo.disponibilidade}%`, icone: 'bi-activity', cor: 'primary' },
        {
            rotulo: 'Latência Média (informativa)',
            valor: resumo.latenciaMedia === null ? '—' : `${resumo.latenciaMedia} ms`,
            icone: 'bi-speedometer',
            cor: 'secondary',
        },
        { rotulo: 'Access Points Online', valor: `${wifi.online}/${wifi.total}`, icone: 'bi-router', cor: 'primary' },
        { rotulo: 'Segurança Offline', valor: `${seguranca.offline} de ${seguranca.total}`, icone: 'bi-shield-exclamation', cor: 'danger' },
    ]);
}

function desenharIndicadores(container, indicadores) {
    limparElemento(container);
    indicadores.forEach((indicador) => container.appendChild(criarCartaoIndicador(indicador)));
}

function criarCartaoIndicador({ rotulo, valor, icone, cor }) {
    const coluna = criarElemento('div', { classes: 'col-6 col-lg-3' });
    const cartao = criarElemento('div', { classes: 'card h-100 shadow-sm' });
    const corpo = criarElemento('div', { classes: 'card-body d-flex align-items-center gap-3 py-3' });

    const caixaIcone = criarElemento('div', { classes: ['stat-icon', `bg-${cor}`, 'bg-opacity-25', `text-${cor}`] });
    caixaIcone.appendChild(criarElemento('i', { classes: ['bi', icone] }));
    corpo.appendChild(caixaIcone);

    const textos = document.createElement('div');
    textos.appendChild(criarElemento('div', { classes: 'text-custom small', texto: rotulo }));
    textos.appendChild(criarElemento('div', { classes: 'text-light fw-bold fs-5', texto: valor }));
    corpo.appendChild(textos);

    cartao.appendChild(corpo);
    coluna.appendChild(cartao);
    return coluna;
}

/**
 * Desenha as barras de disponibilidade por categoria.
 * A parte verde é a fatia de dispositivos UP; quando existe pelo menos
 * um DOWN, o restante do trilho fica avermelhado (nada de "atenção" por
 * latência: só disponibilidade).
 */
export function renderizarCategoriasDashboard(categorias, container) {
    limparElemento(container);

    if (!categorias || categorias.length === 0) {
        container.appendChild(criarElemento('div', { classes: 'empty-state', texto: 'Nenhum dispositivo cadastrado.' }));
        return;
    }

    categorias.forEach((grupo) => container.appendChild(criarLinhaCategoria(grupo)));
}

function criarLinhaCategoria(grupo) {
    const percentual = grupo.total ? Math.round((grupo.online / grupo.total) * 100) : 0;

    const linha = criarElemento('div', { classes: 'category-row' });

    const cabecalho = criarElemento('div', { classes: 'd-flex justify-content-between align-items-center mb-2' });
    const nome = criarElemento('span', { classes: 'text-light small' });
    nome.appendChild(criarElemento('i', { classes: ['bi', ICONES_CATEGORIA[grupo.categoria] || 'bi-hdd', 'me-2', 'text-custom'] }));
    nome.appendChild(document.createTextNode(grupo.categoria));
    cabecalho.appendChild(nome);
    cabecalho.appendChild(criarElemento('span', { classes: 'text-custom small', texto: `${grupo.online}/${grupo.total} online` }));
    linha.appendChild(cabecalho);

    const trilho = criarElemento('div', {
        classes: grupo.offline > 0 ? ['category-progress', 'tem-offline'] : ['category-progress'],
        atributos: {
            role: 'progressbar',
            'aria-label': `Disponibilidade de ${grupo.categoria}`,
            'aria-valuenow': String(percentual),
            'aria-valuemin': '0',
            'aria-valuemax': '100',
        },
    });
    const preenchimento = criarElemento('div', { classes: ['fill', 'bg-success'] });
    preenchimento.style.setProperty('--w', `${percentual}%`);
    preenchimento.style.width = `${percentual}%`;
    trilho.appendChild(preenchimento);
    linha.appendChild(trilho);

    return linha;
}

/**
 * Tabela "Dispositivos Fora do Ar" do Dashboard: lista só os DOWN e
 * cruza com o alerta ativo para mostrar desde quando estão offline.
 */
export function renderizarTabelaOffline(dispositivos, alertas, corpoTabela) {
    limparElemento(corpoTabela);

    const offline = (dispositivos || []).filter((d) => d.status === 'down');

    if (offline.length === 0) {
        corpoTabela.appendChild(criarLinhaVazia(5, 'Nenhum dispositivo offline. Toda a rede está disponível.', 'bi-check2-circle'));
        return;
    }

    offline.forEach((dispositivo) => {
        const alertaAtivo = ordenarPorDataDesc(
            (alertas || []).filter((a) => a.status === 'ativo' && String(a.dispositivo_id) === String(dispositivo.id)),
            'timestamp'
        )[0];

        const linha = document.createElement('tr');
        linha.setAttribute('data-id', dispositivo.id);
        linha.appendChild(criarCelulaTexto(dispositivo.nome, ['ps-4', 'text-light', 'fw-semibold']));
        linha.appendChild(criarCelulaTexto(descreverCategoriaModelo(dispositivo), ['text-custom', 'small']));
        linha.appendChild(criarCelulaTexto(dispositivo.ip, ['font-monospace-ip']));
        linha.appendChild(criarCelulaTexto(alertaAtivo ? formatarDataHora(alertaAtivo.timestamp) : '—', ['text-custom']));
        const celulaStatus = criarElemento('td', { classes: 'pe-4' });
        celulaStatus.appendChild(criarBadgeStatus('down'));
        linha.appendChild(celulaStatus);
        corpoTabela.appendChild(linha);
    });
}

/** Escreve "Atualizado às HH:MM:SS" no elemento informado. */
export function atualizarCarimboDeTempo(elemento) {
    elemento.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
}
