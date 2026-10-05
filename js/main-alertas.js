/**
 * main-alertas.js
 * ------------------------------------------------------------------
 * Orquestrador da tela de Alertas do InfraView.
 *
 *   - GET   /alertas        -> monta a tabela de histórico via DOM (ui.js)
 *   - PATCH /alertas/:id    -> botão "Resolver" nos alertas com status "ativo"
 *   - POST  /logs           -> cada resolução manual fica registrada em Relatórios
 *
 * Os filtros (Todos / Ativos / Resolvidos) trabalham sobre a lista já
 * carregada em memória: não precisam de nova requisição.
 *
 * REGRA DE NEGÓCIO: só existem alertas de disponibilidade (UP/DOWN).
 * "Resolver" marca o alerta como tratado; ele NÃO altera o status do
 * dispositivo (isso é feito na tela Rede, com "Ligar"/"Derrubar").
 * ------------------------------------------------------------------
 */

import { buscarAlertas, atualizarAlerta, registrarLog } from './api.js';

import {
    renderizarTabelaAlertas,
    atualizarContadoresAlertas,
    atualizarContagemResultados,
    atualizarIndicadoresDeAlerta,
    marcarFiltroAtivo,
    definirBotaoOcupado,
    mostrarErro,
    ocultarErro,
} from './ui.js';

const elementos = {
    corpoTabela: document.querySelector('#tabela-alertas tbody'),
    pills: document.querySelectorAll('.filter-pill'),
    contadorAtivos: document.querySelector('#contador-ativos'),
    contadorResolvidos: document.querySelector('#contador-resolvidos'),
    contagemResultados: document.querySelector('#contagem-resultados'),
    containerErro: document.querySelector('#area-erro'),
};

/** Estado da tela: lista completa vinda da API + filtro selecionado. */
const estado = {
    alertas: [],
    filtro: 'todos',
};

function alertasVisiveis() {
    if (estado.filtro === 'todos') {
        return estado.alertas;
    }
    return estado.alertas.filter((alerta) => alerta.status === estado.filtro);
}

/** Redesenha tabela, contadores e indicadores a partir do estado atual. */
function desenharTela() {
    const visiveis = alertasVisiveis();

    renderizarTabelaAlertas(visiveis, elementos.corpoTabela, { onResolver: resolverAlerta });
    atualizarContadoresAlertas(estado.alertas, elementos.contadorAtivos, elementos.contadorResolvidos);
    atualizarContagemResultados(elementos.contagemResultados, visiveis.length, estado.alertas.length, 'alertas');
    atualizarIndicadoresDeAlerta(estado.alertas);
}

/* ------------------------------ GET /alertas ------------------------------ */

async function carregarAlertas() {
    try {
        estado.alertas = await buscarAlertas();
        desenharTela();
        ocultarErro(elementos.containerErro);
    } catch (erro) {
        mostrarErro(erro.message, elementos.containerErro);
    }
}

/* ------------------------ PATCH /alertas/:id (Resolver) --------------------- */

async function resolverAlerta(alerta, botao) {
    definirBotaoOcupado(botao, true);

    try {
        await atualizarAlerta(alerta.id, {
            status: 'resolvido',
            resolvido_em: new Date().toISOString(),
        });

        await registrarLog({
            tipo: 'sistema',
            mensagem: `Alerta resolvido manualmente: ${alerta.mensagem}`,
            origem: 'usuario',
            dispositivo: { id: alerta.dispositivo_id, nome: alerta.dispositivo_nome },
        });

        await carregarAlertas();
    } catch (erro) {
        mostrarErro(erro.message, elementos.containerErro);
        definirBotaoOcupado(botao, false);
    }
}

/* -------------------------------- FILTROS ---------------------------------- */

function tratarCliqueNoFiltro(evento) {
    const pill = evento.currentTarget;
    estado.filtro = pill.getAttribute('data-filtro');
    marcarFiltroAtivo(elementos.pills, pill);
    desenharTela();
}

/* ---------------------------------- BOOT ----------------------------------- */

function inicializar() {
    elementos.pills.forEach((pill) => pill.addEventListener('click', tratarCliqueNoFiltro));
    carregarAlertas();
}

document.addEventListener('DOMContentLoaded', inicializar);
