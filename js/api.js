/**
 * api.js
 * ------------------------------------------------------------------
 * Camada de acesso a dados do InfraView.
 *
 * Responsabilidade única: falar com o JSON Server via Fetch API.
 * Nenhuma função deste módulo toca no DOM. Nenhuma função deste
 * módulo decide regra de negócio (quando abrir/fechar um alerta) —
 * isso é responsabilidade dos orquestradores (main*.js), que decidem
 * quais chamadas fazer e em que ordem.
 *
 * Todas as requisições passam pela função privada `requisitar()`,
 * que concentra o tratamento de erro em um único ponto:
 *   - erro de rede (servidor fora do ar)      -> TypeError do fetch
 *   - erro HTTP (4xx/5xx)                     -> response.ok === false
 * Em ambos os casos lançamos um Error com mensagem amigável, que é
 * capturado pelo main.js e exibido na tela através do ui.js.
 * ------------------------------------------------------------------
 */

const API_BASE_URL = 'http://localhost:3000';

/** Tempo máximo de espera por resposta da API, em milissegundos. */
const TEMPO_LIMITE_MS = 8000;

/**
 * Executa um fetch já tratando erro de rede, timeout, erro HTTP e
 * corpo que não seja JSON válido.
 * @param {string} url
 * @param {RequestInit} [opcoes]
 * @returns {Promise<any|null>} corpo da resposta em JSON, ou null (204 No Content)
 */
async function requisitar(url, opcoes = {}) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);
    let resposta;

    try {
        resposta = await fetch(url, { ...opcoes, signal: controlador.signal });
    } catch (erro) {
        if (erro.name === 'AbortError') {
            throw new Error(`O servidor demorou mais de ${TEMPO_LIMITE_MS / 1000}s para responder. Tente novamente.`);
        }
        throw new Error(
            'Não foi possível conectar ao servidor. Verifique se o JSON Server ' +
            'está em execução (npm run api ou npm start).'
        );
    } finally {
        clearTimeout(temporizador);
    }

    if (!resposta.ok) {
        throw new Error(`O servidor respondeu com erro ${resposta.status} (${resposta.statusText}).`);
    }

    if (resposta.status === 204) {
        return null;
    }

    try {
        return await resposta.json();
    } catch (erroDeParse) {
        throw new Error('O servidor respondeu com um corpo que não é JSON válido.');
    }
}

/* ------------------------------ DISPOSITIVOS ------------------------------ */

/** GET /dispositivos — lista todos os dispositivos cadastrados. */
export function buscarDispositivos() {
    return requisitar(`${API_BASE_URL}/dispositivos`);
}

/**
 * POST /dispositivos — cadastra um novo dispositivo.
 * @param {{nome:string, ip:string, categoria:string, status:string, latencia_ms:number}} dispositivo
 */
export function criarDispositivo(dispositivo) {
    return requisitar(`${API_BASE_URL}/dispositivos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dispositivo),
    });
}

/**
 * PATCH /dispositivos/:id — atualiza apenas o status (up/down) do dispositivo.
 * @param {string} id
 * @param {'up'|'down'} novoStatus
 */
export function atualizarStatusDispositivo(id, novoStatus) {
    return requisitar(`${API_BASE_URL}/dispositivos/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus }),
    });
}

/** DELETE /dispositivos/:id — remove um dispositivo da rede. */
export function excluirDispositivo(id) {
    return requisitar(`${API_BASE_URL}/dispositivos/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
}

/* -------------------------------- ALERTAS --------------------------------- */

/** GET /alertas — lista todos os alertas (ativos e resolvidos). */
export function buscarAlertas() {
    return requisitar(`${API_BASE_URL}/alertas`);
}

/**
 * GET /alertas?dispositivo_id=X&status=ativo
 * Busca o(s) alerta(s) de disponibilidade ainda ativos para um dispositivo
 * específico — usado para fechá-los quando o dispositivo volta a ficar UP.
 */
export function buscarAlertasAtivosPorDispositivo(dispositivoId) {
    return requisitar(`${API_BASE_URL}/alertas?dispositivo_id=${encodeURIComponent(dispositivoId)}&status=ativo`);
}

/**
 * POST /alertas — abre um novo alerta de disponibilidade.
 * @param {{dispositivo_id:string, dispositivo_nome:string, tipo:'down'|'up', status:string, timestamp:string, resolvido_em:string|null, mensagem:string}} alerta
 */
export function criarAlerta(alerta) {
    return requisitar(`${API_BASE_URL}/alertas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alerta),
    });
}

/**
 * PATCH /alertas/:id — atualiza campos parciais de um alerta
 * (usado para marcar um alerta "ativo" como "resolvido").
 */
export function atualizarAlerta(id, dadosParciais) {
    return requisitar(`${API_BASE_URL}/alertas/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosParciais),
    });
}

/* ---------------------------------- LOGS ----------------------------------- */

/** GET /logs — lista todos os registros de eventos do sistema. */
export function buscarLogs() {
    return requisitar(`${API_BASE_URL}/logs`);
}

/**
 * POST /logs — grava um registro de evento já pronto (timestamp incluído).
 * @param {{timestamp:string, dispositivo_id:string|null, dispositivo_nome:string|null, tipo:'down'|'up'|'sistema', mensagem:string, origem:'monitoramento'|'usuario'|'sistema'}} log
 */
export function criarLog(log) {
    return requisitar(`${API_BASE_URL}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log),
    });
}

/**
 * Atalho para registrar um evento "agora": monta o payload com o horário
 * atual e delega ao POST /logs. Usado pelas telas que executam ações
 * (Rede e Alertas) para que a tela de Relatórios reflita o que aconteceu.
 * @param {{tipo:'down'|'up'|'sistema', mensagem:string, origem?:string, dispositivo?:{id:string, nome:string}|null}} evento
 */
export function registrarLog({ tipo, mensagem, origem = 'usuario', dispositivo = null }) {
    return criarLog({
        timestamp: new Date().toISOString(),
        dispositivo_id: dispositivo ? String(dispositivo.id) : null,
        dispositivo_nome: dispositivo ? dispositivo.nome : null,
        tipo,
        mensagem,
        origem,
    });
}
