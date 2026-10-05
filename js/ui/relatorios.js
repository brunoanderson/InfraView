/**
 * ui/relatorios.js
 * ------------------------------------------------------------------
 * Relatórios e Logs: tabela de eventos e filtro de dispositivos.
 * Sem fetch, sem innerHTML: só createElement / textContent /
 * classList / setAttribute / appendChild.
 * ------------------------------------------------------------------
 */

import { ORDEM_CATEGORIAS, limparElemento, criarCelulaTexto, criarBadge, criarLinhaVazia, ordenarPorDataDesc, formatarDataHora } from './helpers.js';

const TIPOS_LOG = {
    down: { rotulo: 'DOWN', cor: 'bg-danger' },
    up: { rotulo: 'UP', cor: 'bg-success' },
    sistema: { rotulo: 'SISTEMA', cor: 'bg-secondary' },
};

const ORIGENS_LOG = {
    monitoramento: 'Monitoramento',
    usuario: 'Usuário',
    sistema: 'Sistema',
};

/**
 * Redesenha a tabela de logs (já filtrados e ordenados pelo orquestrador).
 * @param {Array<object>} logs
 * @param {HTMLTableSectionElement} corpoTabela
 */
export function renderizarTabelaLogs(logs, corpoTabela) {
    limparElemento(corpoTabela);

    if (!logs || logs.length === 0) {
        corpoTabela.appendChild(criarLinhaVazia(5, 'Nenhum registro encontrado para os filtros selecionados.'));
        return;
    }

    ordenarPorDataDesc(logs, 'timestamp').forEach((log) => {
        corpoTabela.appendChild(criarLinhaLog(log));
    });
}

function criarLinhaLog(log) {
    const tipo = TIPOS_LOG[log.tipo] || TIPOS_LOG.sistema;

    const linha = document.createElement('tr');
    linha.setAttribute('data-id', log.id);

    linha.appendChild(criarCelulaTexto(formatarDataHora(log.timestamp), ['ps-4', 'text-custom', 'small']));
    linha.appendChild(criarCelulaTexto(log.dispositivo_nome || '—', ['text-light', 'fw-semibold']));

    const celulaTipo = document.createElement('td');
    celulaTipo.appendChild(criarBadge(tipo.rotulo, tipo.cor));
    linha.appendChild(celulaTipo);

    linha.appendChild(criarCelulaTexto(log.mensagem, ['text-custom']));
    linha.appendChild(criarCelulaTexto(ORIGENS_LOG[log.origem] || log.origem || '—', ['pe-4', 'text-custom', 'small']));

    return linha;
}

/**
 * Preenche o <select> de dispositivos do filtro de relatórios.
 * Mantém a primeira opção ("Todos os dispositivos"), cria um <optgroup>
 * por categoria e um grupo extra para dispositivos que já foram removidos
 * mas ainda aparecem nos logs. Os valores das opções são os NOMES, que é o
 * que os logs guardam.
 * @param {HTMLSelectElement} select
 * @param {Array<object>} dispositivos
 * @param {Array<object>} logs
 */
export function popularFiltroDispositivos(select, dispositivos, logs) {
    const valorSelecionado = select.value;

    while (select.children.length > 1) {
        select.removeChild(select.lastChild);
    }

    const nomesAtuais = new Set();
    const grupos = new Map();
    (dispositivos || []).forEach((d) => {
        nomesAtuais.add(d.nome);
        const categoria = d.categoria || 'Outros';
        if (!grupos.has(categoria)) {
            grupos.set(categoria, []);
        }
        grupos.get(categoria).push(d.nome);
    });

    const categoriasOrdenadas = [...grupos.keys()].sort((a, b) => {
        const ia = ORDEM_CATEGORIAS.indexOf(a);
        const ib = ORDEM_CATEGORIAS.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    categoriasOrdenadas.forEach((categoria) => {
        select.appendChild(criarGrupoDeOpcoes(categoria, grupos.get(categoria)));
    });

    const removidos = [...new Set((logs || []).map((l) => l.dispositivo_nome).filter(Boolean))]
        .filter((nome) => !nomesAtuais.has(nome))
        .sort();
    if (removidos.length > 0) {
        select.appendChild(criarGrupoDeOpcoes('Dispositivos removidos', removidos));
    }

    const aindaExiste = [...select.options].some((opcao) => opcao.value === valorSelecionado);
    select.value = aindaExiste ? valorSelecionado : 'todos';
}

function criarGrupoDeOpcoes(rotulo, nomes) {
    const grupo = document.createElement('optgroup');
    grupo.setAttribute('label', rotulo);
    nomes.forEach((nome) => {
        const opcao = document.createElement('option');
        opcao.value = nome;
        opcao.textContent = nome;
        grupo.appendChild(opcao);
    });
    return grupo;
}

/** Escreve "N registro(s)" no badge de contagem. */
export function atualizarBadgeRegistros(elemento, quantidade) {
    elemento.textContent = `${quantidade} registro${quantidade === 1 ? '' : 's'}`;
}
