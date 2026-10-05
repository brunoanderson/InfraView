/**
 * main-dashboard.js
 * ------------------------------------------------------------------
 * Orquestrador da tela de Dashboard do InfraView.
 *
 * Ao carregar (e ao clicar em "Atualizar") faz GET /dispositivos e
 * GET /alertas em paralelo, calcula o resumo UP/DOWN e delega o
 * desenho dos widgets ao ui.js. Nenhum HTML de widget existe na
 * página: tudo é criado via createElement.
 *
 * REGRA DE NEGÓCIO: o painel mostra apenas DISPONIBILIDADE (UP/DOWN).
 * A latência média é exibida como dado informativo e nunca colore
 * nem dispara alerta.
 * ------------------------------------------------------------------
 */

import { buscarDispositivos, buscarAlertas } from './api.js';

import {
    calcularResumoDashboard,
    renderizarIndicadoresDashboard,
    renderizarCategoriasDashboard,
    renderizarAlertasRecentes,
    renderizarTabelaOffline,
    atualizarBadgeAlertasAtivos,
    atualizarIndicadoresDeAlerta,
    atualizarCarimboDeTempo,
    definirBotaoOcupado,
    mostrarErro,
    ocultarErro,
} from './ui.js';

const QUANTIDADE_ALERTAS_RECENTES = 5;

const elementos = {
    indicadoresPrincipais: document.querySelector('#indicadores-principais'),
    indicadoresSecundarios: document.querySelector('#indicadores-secundarios'),
    listaCategorias: document.querySelector('#lista-categorias'),
    listaAlertasRecentes: document.querySelector('#lista-alertas-recentes'),
    badgeAlertasAtivos: document.querySelector('#badge-alertas-ativos'),
    corpoTabelaOffline: document.querySelector('#tabela-offline tbody'),
    carimbo: document.querySelector('#ultima-atualizacao'),
    botaoAtualizar: document.querySelector('#botao-atualizar'),
    containerErro: document.querySelector('#area-erro'),
};

/** Busca os dados na API e redesenha todos os widgets do painel. */
async function carregarPainel() {
    definirBotaoOcupado(elementos.botaoAtualizar, true);

    try {
        const [dispositivos, alertas] = await Promise.all([buscarDispositivos(), buscarAlertas()]);
        const resumo = calcularResumoDashboard(dispositivos, alertas);

        renderizarIndicadoresDashboard(resumo, elementos.indicadoresPrincipais, elementos.indicadoresSecundarios);
        renderizarCategoriasDashboard(resumo.categorias, elementos.listaCategorias);
        renderizarAlertasRecentes(alertas, elementos.listaAlertasRecentes, QUANTIDADE_ALERTAS_RECENTES);
        renderizarTabelaOffline(dispositivos, alertas, elementos.corpoTabelaOffline);
        atualizarBadgeAlertasAtivos(alertas, elementos.badgeAlertasAtivos);
        atualizarIndicadoresDeAlerta(alertas);
        atualizarCarimboDeTempo(elementos.carimbo);

        ocultarErro(elementos.containerErro);
    } catch (erro) {
        mostrarErro(erro.message, elementos.containerErro);
    } finally {
        definirBotaoOcupado(elementos.botaoAtualizar, false);
    }
}

function inicializar() {
    elementos.botaoAtualizar.addEventListener('click', carregarPainel);
    carregarPainel();
}

document.addEventListener('DOMContentLoaded', inicializar);
