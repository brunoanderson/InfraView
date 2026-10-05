/**
 * ui/dispositivos.js
 * ------------------------------------------------------------------
 * Tela Rede: tabela de dispositivos e contadores UP/DOWN.
 * Sem fetch, sem innerHTML: só createElement / textContent /
 * classList / setAttribute / appendChild.
 * ------------------------------------------------------------------
 */

import { limparElemento, criarCelulaTexto, criarLinhaVazia } from './helpers.js';

/**
 * Limpa e redesenha o corpo da tabela de dispositivos.
 * @param {Array<object>} dispositivos
 * @param {HTMLTableSectionElement} corpoTabela
 * @param {{onAlternarStatus:Function, onExcluir:Function}} callbacks
 * @param {string} [mensagemVazia] texto do estado vazio (diferente quando a busca não encontra nada)
 */
export function renderizarTabelaDispositivos(dispositivos, corpoTabela, callbacks, mensagemVazia = 'Nenhum dispositivo cadastrado ainda.') {
    limparElemento(corpoTabela);

    if (!dispositivos || dispositivos.length === 0) {
        corpoTabela.appendChild(criarLinhaVazia(6, mensagemVazia));
        return;
    }

    dispositivos.forEach((dispositivo) => {
        corpoTabela.appendChild(criarLinhaDispositivo(dispositivo, callbacks));
    });
}

function criarLinhaDispositivo(dispositivo, callbacks) {
    const linha = document.createElement('tr');
    linha.setAttribute('data-id', dispositivo.id);
    if (dispositivo.status === 'down') {
        linha.classList.add('table-danger');
    }

    linha.appendChild(criarCelulaTexto(dispositivo.nome, ['ps-4', 'text-light', 'fw-semibold']));
    linha.appendChild(criarCelulaTexto(descreverCategoriaModelo(dispositivo), ['text-custom', 'small']));
    linha.appendChild(criarCelulaTexto(dispositivo.ip, ['font-monospace-ip']));
    linha.appendChild(criarCelulaLatencia(dispositivo));
    linha.appendChild(criarCelulaStatus(dispositivo));
    linha.appendChild(criarCelulaAcoes(dispositivo, callbacks));

    return linha;
}

/** "Categoria · Modelo" — dispositivos cadastrados pelo formulário não têm modelo. */
export function descreverCategoriaModelo(dispositivo) {
    return [dispositivo.categoria, dispositivo.modelo].filter(Boolean).join(' · ');
}

function criarCelulaLatencia(dispositivo) {
    const celula = document.createElement('td');
    celula.classList.add('text-custom');
    // Regra de negócio: latência é apenas informativa, nunca gera alerta.
    // 0 ms significa "ainda sem medição" (ex.: dispositivo recém-cadastrado).
    const temMedicao = dispositivo.status === 'up' && Number(dispositivo.latencia_ms) > 0;
    celula.textContent = temMedicao ? `${dispositivo.latencia_ms} ms` : '—';
    return celula;
}

function criarCelulaStatus(dispositivo) {
    const celula = document.createElement('td');
    celula.appendChild(criarBadgeStatus(dispositivo.status));
    return celula;
}

export function criarBadgeStatus(status) {
    const badge = document.createElement('span');
    badge.classList.add('badge', status === 'up' ? 'bg-success' : 'bg-danger');
    badge.textContent = status === 'up' ? 'Online' : 'Offline';
    return badge;
}

function criarCelulaAcoes(dispositivo, callbacks) {
    const celula = document.createElement('td');
    celula.classList.add('pe-4', 'text-end');
    celula.appendChild(criarBotaoAlternarStatus(dispositivo, callbacks.onAlternarStatus));
    celula.appendChild(criarBotaoExcluir(dispositivo, callbacks.onExcluir));
    return celula;
}

function criarBotaoAlternarStatus(dispositivo, aoClicar) {
    const estaOnline = dispositivo.status === 'up';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.classList.add('btn', 'btn-sm', estaOnline ? 'btn-outline-danger' : 'btn-outline-success', 'me-2');
    botao.textContent = estaOnline ? 'Derrubar' : 'Ligar';
    botao.setAttribute('aria-label', `Alternar status de ${dispositivo.nome}`);
    botao.setAttribute('data-acao', 'alternar-status');
    botao.addEventListener('click', () => aoClicar(dispositivo));
    return botao;
}

function criarBotaoExcluir(dispositivo, aoClicar) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.classList.add('btn', 'btn-sm', 'btn-outline-secondary');
    botao.textContent = 'Excluir';
    botao.setAttribute('aria-label', `Excluir ${dispositivo.nome}`);
    botao.setAttribute('data-acao', 'excluir');
    botao.addEventListener('click', () => aoClicar(dispositivo));
    return botao;
}

/**
 * Atualiza os badges de resumo (total / online / offline) no topo da tela Rede.
 */
export function atualizarContadores(dispositivos, elementoTotal, elementoOnline, elementoOffline) {
    const total = dispositivos.length;
    const online = dispositivos.filter((d) => d.status === 'up').length;
    const offline = total - online;

    elementoTotal.textContent = `${total} dispositivo${total === 1 ? '' : 's'}`;
    elementoOnline.textContent = `${online} online`;
    elementoOffline.textContent = `${offline} offline`;
}
