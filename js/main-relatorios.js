/**
 * main-relatorios.js
 * ------------------------------------------------------------------
 * Orquestrador da tela de Relatórios e Logs do InfraView.
 *
 *   - GET /logs          -> registros de eventos do sistema (tabela via DOM)
 *   - GET /dispositivos  -> alimenta as opções do filtro "Dispositivo"
 *   - GET /alertas       -> apenas para o sino/badge de alertas ativos
 *
 * Os filtros (período, dispositivo, tipo) são aplicados em memória sobre
 * a lista de logs carregada; o <form> é interceptado com preventDefault.
 *
 * REGRA DE NEGÓCIO: os logs registram DISPONIBILIDADE (down/up) e ações
 * do sistema (cadastro, remoção, resolução). Não há "pico de latência".
 * ------------------------------------------------------------------
 */

import { buscarLogs, buscarDispositivos, buscarAlertas } from './api.js';

import {
    renderizarTabelaLogs,
    popularFiltroDispositivos,
    atualizarBadgeRegistros,
    atualizarContagemResultados,
    atualizarIndicadoresDeAlerta,
    mostrarErro,
    ocultarErro,
} from './ui.js';

const MS_POR_HORA = 60 * 60 * 1000;

/** Janela de cada opção do filtro "Período", em horas. */
const PERIODOS_EM_HORAS = {
    '24h': 24,
    '7d': 24 * 7,
    '30d': 24 * 30,
    todos: Infinity,
};

const elementos = {
    formulario: document.querySelector('#form-filtros'),
    filtroPeriodo: document.querySelector('#filtro-periodo'),
    filtroDispositivo: document.querySelector('#filtro-dispositivo'),
    filtroTipo: document.querySelector('#filtro-tipo'),
    corpoTabela: document.querySelector('#tabela-logs tbody'),
    badgeLogs: document.querySelector('#badge-logs'),
    contagemResultados: document.querySelector('#contagem-resultados'),
    containerErro: document.querySelector('#area-erro'),
};

/** Lista completa de logs vinda da API (os filtros nunca a modificam). */
let todosOsLogs = [];

/**
 * Aplica os três filtros sobre a lista de logs. Função pura.
 * @param {Array<object>} logs
 * @param {{periodo:string, dispositivo:string, tipo:string}} criterios
 * @param {number} [agora=Date.now()]
 */
function filtrarLogs(logs, { periodo, dispositivo, tipo }, agora = Date.now()) {
    const horas = PERIODOS_EM_HORAS[periodo] ?? Infinity;
    const limite = agora - horas * MS_POR_HORA;

    return logs.filter((log) => {
        const dentroDoPeriodo = horas === Infinity || new Date(log.timestamp).getTime() >= limite;
        const doDispositivo = dispositivo === 'todos' || log.dispositivo_nome === dispositivo;
        const doTipo = tipo === 'todos' || log.tipo === tipo;
        return dentroDoPeriodo && doDispositivo && doTipo;
    });
}

function aplicarFiltros() {
    const filtrados = filtrarLogs(todosOsLogs, {
        periodo: elementos.filtroPeriodo.value,
        dispositivo: elementos.filtroDispositivo.value,
        tipo: elementos.filtroTipo.value,
    });

    renderizarTabelaLogs(filtrados, elementos.corpoTabela);
    atualizarBadgeRegistros(elementos.badgeLogs, filtrados.length);
    atualizarContagemResultados(elementos.contagemResultados, filtrados.length, todosOsLogs.length, 'registros');
}

/* ------------------------------ GET /logs etc. ----------------------------- */

async function carregarRelatorio() {
    try {
        const [logs, dispositivos, alertas] = await Promise.all([
            buscarLogs(),
            buscarDispositivos(),
            buscarAlertas(),
        ]);

        todosOsLogs = logs;
        popularFiltroDispositivos(elementos.filtroDispositivo, dispositivos, logs);
        atualizarIndicadoresDeAlerta(alertas);
        aplicarFiltros();
        ocultarErro(elementos.containerErro);
    } catch (erro) {
        mostrarErro(erro.message, elementos.containerErro);
    }
}

/* -------------------------------- EVENTOS ---------------------------------- */

function tratarEnvioFiltros(evento) {
    evento.preventDefault();
    aplicarFiltros();
}

function inicializar() {
    elementos.formulario.addEventListener('submit', tratarEnvioFiltros);
    [elementos.filtroPeriodo, elementos.filtroDispositivo, elementos.filtroTipo].forEach((select) => {
        select.addEventListener('change', aplicarFiltros);
    });
    carregarRelatorio();
}

document.addEventListener('DOMContentLoaded', inicializar);
