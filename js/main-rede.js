/**
 * main-rede.js
 * ------------------------------------------------------------------
 * Orquestrador da tela de Rede do InfraView.
 *
 * Importa as funções de dados (api.js) e de apresentação (ui.js),
 * liga os eventos da página e aplica a única regra de negócio de
 * alertas do sistema:
 *
 *   REGRA: um alerta só é criado/fechado quando o status de um
 *   dispositivo muda entre "up" e "down". Latência, temperatura,
 *   bateria etc. são apenas dados informativos exibidos na tabela —
 *   nunca disparam alerta.
 *
 * Toda ação que muda o estado da rede (cadastrar, derrubar/ligar,
 * excluir) também grava um registro em /logs, que aparece na tela
 * de Relatórios.
 *
 * A busca (nome, IP, categoria ou modelo) filtra em memória a cada
 * tecla digitada (evento "input"), sem nova requisição.
 * ------------------------------------------------------------------
 */

import {
    buscarDispositivos,
    criarDispositivo,
    atualizarStatusDispositivo,
    excluirDispositivo,
    buscarAlertas,
    buscarAlertasAtivosPorDispositivo,
    criarAlerta,
    atualizarAlerta,
    registrarLog,
} from './api.js';

import {
    renderizarTabelaDispositivos,
    renderizarAlertas,
    atualizarContadores,
    atualizarContagemResultados,
    atualizarIndicadoresDeAlerta,
    mostrarErro,
    ocultarErro,
    limparFormulario,
} from './ui.js';

/** IPv4 com cada octeto entre 0 e 255. */
const PADRAO_IPV4 = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/;

/* ------------------------------ REFERÊNCIAS DOM ----------------------------- */

const elementos = {
    corpoTabela: document.querySelector('#tabela-dispositivos tbody'),
    listaAlertas: document.querySelector('#lista-alertas'),
    formulario: document.querySelector('#form-novo-dispositivo'),
    campoBusca: document.querySelector('#campo-busca'),
    contagemResultados: document.querySelector('#contagem-resultados'),
    containerErro: document.querySelector('#area-erro'),
    badgeTotal: document.querySelector('#contagem-total'),
    badgeOnline: document.querySelector('#contagem-online'),
    badgeOffline: document.querySelector('#contagem-offline'),
};

/** Lista completa vinda da API; a busca só filtra a visualização. */
let todosOsDispositivos = [];

/* --------------------------------- LEITURA ---------------------------------- */

/** Aplica o texto da busca (nome, IP, categoria, modelo). Função pura. */
function filtrarDispositivos(dispositivos, termo) {
    const busca = termo.trim().toLowerCase();
    if (!busca) {
        return dispositivos;
    }
    return dispositivos.filter((d) =>
        [d.nome, d.ip, d.categoria, d.modelo].filter(Boolean).some((campo) => campo.toLowerCase().includes(busca))
    );
}

/** Redesenha tabela, contagem e badges a partir da lista em memória. */
function desenharTabela() {
    const termo = elementos.campoBusca.value;
    const visiveis = filtrarDispositivos(todosOsDispositivos, termo);
    const mensagemVazia = termo.trim()
        ? 'Nenhum dispositivo encontrado para esta busca.'
        : 'Nenhum dispositivo cadastrado ainda.';

    renderizarTabelaDispositivos(visiveis, elementos.corpoTabela, {
        onAlternarStatus: alternarStatusDispositivo,
        onExcluir: confirmarExclusaoDispositivo,
    }, mensagemVazia);
    atualizarContagemResultados(elementos.contagemResultados, visiveis.length, todosOsDispositivos.length, 'dispositivos');
    atualizarContadores(todosOsDispositivos, elementos.badgeTotal, elementos.badgeOnline, elementos.badgeOffline);
}

/** Busca os dispositivos na API e redesenha a tabela + contadores. */
async function carregarDispositivos() {
    try {
        todosOsDispositivos = await buscarDispositivos();
        desenharTabela();
        ocultarErro(elementos.containerErro);
    } catch (erro) {
        mostrarErro(erro.message, elementos.containerErro);
    }
}

/** Busca os alertas na API e redesenha o painel de alertas de disponibilidade. */
async function carregarAlertas() {
    try {
        const alertas = await buscarAlertas();
        renderizarAlertas(alertas, elementos.listaAlertas);
        atualizarIndicadoresDeAlerta(alertas);
    } catch (erro) {
        mostrarErro(erro.message, elementos.containerErro);
    }
}

/* ------------------------- CRIAÇÃO (POST /dispositivos) --------------------- */

function tratarEnvioFormulario(evento) {
    evento.preventDefault();

    const dados = new FormData(elementos.formulario);
    const nome = (dados.get('nome') || '').trim();
    const ip = (dados.get('ip') || '').trim();
    const categoria = dados.get('categoria');

    if (!nome || !ip || !categoria) {
        mostrarErro('Preencha nome, IP e categoria antes de cadastrar o dispositivo.', elementos.containerErro);
        return;
    }

    if (!PADRAO_IPV4.test(ip)) {
        mostrarErro('Informe um endereço IPv4 válido, por exemplo 192.168.1.50.', elementos.containerErro);
        return;
    }

    const novoDispositivo = {
        nome,
        ip,
        categoria,
        status: 'up',
        latencia_ms: 0,
    };

    cadastrarDispositivo(novoDispositivo);
}

async function cadastrarDispositivo(dispositivo) {
    try {
        const criado = await criarDispositivo(dispositivo);
        await registrarLog({
            tipo: 'sistema',
            mensagem: `Dispositivo ${criado.nome} cadastrado na rede monitorada`,
            origem: 'usuario',
            dispositivo: criado,
        });

        limparFormulario(elementos.formulario);
        ocultarErro(elementos.containerErro);
        await carregarDispositivos();
    } catch (erro) {
        mostrarErro(erro.message, elementos.containerErro);
    }
}

/* ------------------- ATUALIZAÇÃO (PATCH /dispositivos/:id) ------------------ */

/**
 * Alterna o status do dispositivo (up <-> down) e aplica a regra de
 * negócio de alertas:
 *   - virou DOWN  -> abre um novo alerta "ativo"
 *   - virou UP    -> fecha (marca "resolvido") qualquer alerta ativo
 *                    desse dispositivo
 * Em ambos os casos grava o evento em /logs.
 *
 * Se o alerta ou o log falharem DEPOIS de o status ter sido alterado,
 * tenta desfazer a mudança (compensação) para não deixar o dispositivo
 * num estado sem o alerta/log correspondente.
 */
async function alternarStatusDispositivo(dispositivo) {
    const statusAnterior = dispositivo.status;
    const novoStatus = statusAnterior === 'up' ? 'down' : 'up';

    try {
        await atualizarStatusDispositivo(dispositivo.id, novoStatus);

        try {
            if (novoStatus === 'down') {
                await abrirAlertaDeQueda(dispositivo);
            } else {
                await resolverAlertasAtivos(dispositivo);
            }

            await registrarLog({
                tipo: novoStatus,
                mensagem: `${dispositivo.nome} ${novoStatus === 'down' ? 'mudou para DOWN' : 'voltou para UP'} (ação manual)`,
                origem: 'usuario',
                dispositivo,
            });
        } catch (erroSecundario) {
            await desfazerMudancaDeStatus(dispositivo, statusAnterior);
            throw erroSecundario;
        }

        ocultarErro(elementos.containerErro);
        await carregarDispositivos();
        await carregarAlertas();
    } catch (erro) {
        // Recarrega primeiro (a tela volta a refletir a API) e só então mostra o erro,
        // porque carregarDispositivos() esconde o banner quando termina com sucesso.
        await carregarDispositivos();
        await carregarAlertas();
        mostrarErro(erro.message, elementos.containerErro);
    }
}

/** Compensação em "melhor esforço": volta o status e reconcilia os alertas. */
async function desfazerMudancaDeStatus(dispositivo, statusAnterior) {
    try {
        await atualizarStatusDispositivo(dispositivo.id, statusAnterior);
        const ativos = await buscarAlertasAtivosPorDispositivo(dispositivo.id);

        if (statusAnterior === 'up') {
            await resolverAlertasAtivos(dispositivo);
        } else if (ativos.length === 0) {
            await abrirAlertaDeQueda(dispositivo);
        }
    } catch (erroDaCompensacao) {
        // Sem como desfazer (API fora do ar): o erro original já será exibido ao usuário.
    }
}

async function abrirAlertaDeQueda(dispositivo) {
    await criarAlerta({
        dispositivo_id: dispositivo.id,
        dispositivo_nome: dispositivo.nome,
        tipo: 'down',
        status: 'ativo',
        timestamp: new Date().toISOString(),
        resolvido_em: null,
        mensagem: `${dispositivo.nome} mudou para DOWN`,
    });
}

async function resolverAlertasAtivos(dispositivo) {
    const alertasAtivos = await buscarAlertasAtivosPorDispositivo(dispositivo.id);
    const resolvidoEm = new Date().toISOString();

    await Promise.all(
        alertasAtivos.map((alerta) => atualizarAlerta(alerta.id, { status: 'resolvido', resolvido_em: resolvidoEm }))
    );
}

/* --------------------------- REMOÇÃO (DELETE) -------------------------------- */

async function confirmarExclusaoDispositivo(dispositivo) {
    const confirmado = window.confirm(`Remover o dispositivo "${dispositivo.nome}" da rede monitorada?`);
    if (!confirmado) {
        return;
    }

    try {
        await excluirDispositivo(dispositivo.id);

        // Um dispositivo que não existe mais não pode manter alerta ativo.
        await resolverAlertasAtivos(dispositivo);

        await registrarLog({
            tipo: 'sistema',
            mensagem: `Dispositivo ${dispositivo.nome} removido da rede monitorada`,
            origem: 'usuario',
            dispositivo,
        });

        ocultarErro(elementos.containerErro);
        await carregarDispositivos();
        await carregarAlertas();
    } catch (erro) {
        mostrarErro(erro.message, elementos.containerErro);
    }
}

/* ---------------------------------- BOOT -------------------------------------- */

function inicializar() {
    elementos.formulario.addEventListener('submit', tratarEnvioFormulario);
    elementos.campoBusca.addEventListener('input', desenharTabela);
    carregarDispositivos();
    carregarAlertas();
}

document.addEventListener('DOMContentLoaded', inicializar);
