/**
 * ui/alertas.js
 * ------------------------------------------------------------------
 * Alertas: lista (Rede/Dashboard), tabela (Alertas), contadores e sino global.
 * Sem fetch, sem innerHTML: só createElement / textContent /
 * classList / setAttribute / appendChild.
 * ------------------------------------------------------------------
 */

import { limparElemento, ordenarPorDataDesc, criarBadge, criarElemento, criarCelulaTexto, criarLinhaVazia, formatarDataHora } from './helpers.js';

/**
 * Redesenha a lista de alertas de disponibilidade ATIVOS (tela Rede).
 * Regra de negócio: só existem alertas de tipo "down" (queda) e
 * "up" (volta ao ar) — nada de latência/temperatura/bateria aqui.
 * @param {Array<object>} alertas
 * @param {HTMLElement} lista
 */
export function renderizarAlertas(alertas, lista) {
    const ativos = ordenarPorDataDesc((alertas || []).filter((a) => a.status === 'ativo'), 'timestamp');
    desenharListaDeAlertas(ativos, lista, 'Nenhum alerta de disponibilidade ativo no momento.');
}

/**
 * Redesenha a lista com os N alertas mais recentes (ativos ou resolvidos),
 * usada no card "Alertas Recentes" do Dashboard.
 * @param {Array<object>} alertas
 * @param {HTMLElement} lista
 * @param {number} [limite=5]
 */
export function renderizarAlertasRecentes(alertas, lista, limite = 5) {
    const recentes = ordenarPorDataDesc(alertas || [], 'timestamp').slice(0, limite);
    desenharListaDeAlertas(recentes, lista, 'Nenhum alerta registrado até agora.');
}

function desenharListaDeAlertas(alertas, lista, mensagemVazia) {
    limparElemento(lista);

    if (alertas.length === 0) {
        const vazio = document.createElement('li');
        vazio.classList.add('empty-state', 'py-3');
        vazio.textContent = mensagemVazia;
        lista.appendChild(vazio);
        return;
    }

    alertas.forEach((alerta) => {
        lista.appendChild(criarItemAlerta(alerta));
    });
}

function criarItemAlerta(alerta) {
    const estaAtivo = alerta.status === 'ativo';

    const item = document.createElement('li');
    item.classList.add('alert-item');

    const icone = document.createElement('div');
    icone.classList.add('alert-icon', estaAtivo ? 'severity-critical' : 'severity-resolved');
    const simbolo = document.createElement('i');
    simbolo.classList.add('bi', alerta.tipo === 'down' ? 'bi-wifi-off' : 'bi-check-circle');
    icone.appendChild(simbolo);
    item.appendChild(icone);

    const conteudo = document.createElement('div');
    conteudo.classList.add('flex-grow-1');

    const mensagem = document.createElement('p');
    mensagem.classList.add('text-light', 'small', 'fw-bold', 'mb-0');
    mensagem.textContent = alerta.mensagem;
    conteudo.appendChild(mensagem);

    const dataHora = document.createElement('p');
    dataHora.classList.add('text-custom', 'small', 'mb-0');
    let detalhe = `Aberto em ${formatarDataHora(alerta.timestamp)}`;
    if (!estaAtivo && alerta.resolvido_em) {
        detalhe += ` · resolvido em ${formatarDataHora(alerta.resolvido_em)}`;
    }
    dataHora.textContent = detalhe;
    conteudo.appendChild(dataHora);

    item.appendChild(conteudo);
    item.appendChild(criarBadge(estaAtivo ? 'Ativo' : 'Resolvido', estaAtivo ? 'bg-danger' : 'bg-success'));
    return item;
}

/**
 * Redesenha a tabela de histórico de alertas.
 * Alertas "ativos" recebem o botão "Resolver" (PATCH feito pelo main-alertas.js).
 * @param {Array<object>} alertas
 * @param {HTMLTableSectionElement} corpoTabela
 * @param {{onResolver:(alerta:object, botao:HTMLButtonElement)=>void}} callbacks
 */
export function renderizarTabelaAlertas(alertas, corpoTabela, callbacks) {
    limparElemento(corpoTabela);

    if (!alertas || alertas.length === 0) {
        corpoTabela.appendChild(criarLinhaVazia(7, 'Nenhum alerta encontrado para este filtro.'));
        return;
    }

    ordenarPorDataDesc(alertas, 'timestamp').forEach((alerta) => {
        corpoTabela.appendChild(criarLinhaAlerta(alerta, callbacks));
    });
}

function criarLinhaAlerta(alerta, callbacks) {
    const estaAtivo = alerta.status === 'ativo';

    const linha = document.createElement('tr');
    linha.setAttribute('data-id', alerta.id);

    linha.appendChild(criarCelulaTexto(alerta.dispositivo_nome, ['ps-4', 'text-light', 'fw-semibold']));
    linha.appendChild(criarCelulaTexto(alerta.mensagem, ['text-custom']));

    const celulaTipo = document.createElement('td');
    celulaTipo.appendChild(criarBadge(alerta.tipo === 'down' ? 'DOWN' : 'UP', alerta.tipo === 'down' ? 'bg-danger' : 'bg-success'));
    linha.appendChild(celulaTipo);

    const celulaStatus = document.createElement('td');
    celulaStatus.appendChild(criarBadge(estaAtivo ? 'Ativo' : 'Resolvido', estaAtivo ? 'bg-danger' : 'bg-success'));
    linha.appendChild(celulaStatus);

    linha.appendChild(criarCelulaTexto(formatarDataHora(alerta.timestamp), ['text-custom', 'small']));
    linha.appendChild(criarCelulaTexto(alerta.resolvido_em ? formatarDataHora(alerta.resolvido_em) : '—', ['text-custom', 'small']));

    const celulaAcoes = criarElemento('td', { classes: ['pe-4', 'text-end'] });
    if (estaAtivo) {
        celulaAcoes.appendChild(criarBotaoResolver(alerta, callbacks.onResolver));
    } else {
        celulaAcoes.appendChild(criarElemento('span', { classes: 'text-custom small', texto: '—' }));
    }
    linha.appendChild(celulaAcoes);

    return linha;
}

function criarBotaoResolver(alerta, aoClicar) {
    const botao = criarElemento('button', {
        classes: ['btn', 'btn-sm', 'btn-outline-success'],
        atributos: {
            type: 'button',
            'data-acao': 'resolver',
            'aria-label': `Resolver alerta: ${alerta.mensagem}`,
        },
    });
    botao.appendChild(criarElemento('i', { classes: ['bi', 'bi-check2-circle', 'me-1'] }));
    botao.appendChild(document.createTextNode('Resolver'));
    botao.addEventListener('click', () => aoClicar(alerta, botao));
    return botao;
}

/** Atualiza os badges "N ativos" / "N resolvidos" no topo da tela de Alertas. */
export function atualizarContadoresAlertas(alertas, elementoAtivos, elementoResolvidos) {
    const lista = alertas || [];
    const ativos = lista.filter((a) => a.status === 'ativo').length;
    const resolvidos = lista.length - ativos;

    elementoAtivos.textContent = `${ativos} ativo${ativos === 1 ? '' : 's'}`;
    elementoResolvidos.textContent = `${resolvidos} resolvido${resolvidos === 1 ? '' : 's'}`;
}

/** Destaca visualmente o filtro (pill) selecionado e desmarca os demais. */
export function marcarFiltroAtivo(pills, pillAtivo) {
    pills.forEach((pill) => {
        const ehAtivo = pill === pillAtivo;
        pill.classList.toggle('active', ehAtivo);
        pill.setAttribute('aria-pressed', String(ehAtivo));
    });
}

/**
 * Mantém sino e badge do menu sincronizados com o número real de alertas
 * ativos. O HTML traz esses elementos escondidos (d-none); aqui eles são
 * mostrados/atualizados conforme os dados da API.
 * @param {Array<object>} alertas
 * @returns {number} quantidade de alertas ativos
 */
export function atualizarIndicadoresDeAlerta(alertas) {
    const ativos = (alertas || []).filter((a) => a.status === 'ativo').length;

    document.querySelectorAll('[data-contador-alertas]').forEach((elemento) => {
        elemento.textContent = String(ativos);
        elemento.classList.toggle('d-none', ativos === 0);
    });

    document.querySelectorAll('[data-indicador-alertas]').forEach((elemento) => {
        elemento.classList.toggle('d-none', ativos === 0);
        elemento.classList.toggle('has-alert', ativos > 0);
    });

    return ativos;
}

/** Escreve "N ativo(s)" num único badge (card "Alertas Recentes" do Dashboard). */
export function atualizarBadgeAlertasAtivos(alertas, elemento) {
    const ativos = (alertas || []).filter((a) => a.status === 'ativo').length;
    elemento.textContent = `${ativos} ativo${ativos === 1 ? '' : 's'}`;
}
