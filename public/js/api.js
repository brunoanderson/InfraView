// =============================================================================
// api.js — o ÚNICO lugar do front que conversa com o back-end.
//
//   const { devices } = await api('GET', '/devices');
//   await api('POST', '/devices', { name: 'AP-SALA', ... });
//
// - Fala sempre com /api do mesmo endereço do site (sem URL absoluta).
// - Envia o token de login no cabeçalho Authorization, se houver.
// - Se der certo, devolve o JSON da resposta (ou null no 204).
// - Se der errado, LANÇA um ApiError com status, code, message e details. A
//   mensagem já vem em português, pronta para mostrar ao usuário.
// =============================================================================
import { clearSession, getToken } from './auth.js';

const TIMEOUT_MS = 15_000;

/** Erro de uma chamada à API. status = 0 quando nem chegou ao servidor. */
export class ApiError extends Error {
    constructor(status, code, message, details) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

/** Mensagem padrão, para quando a resposta não trouxer uma. */
const DEFAULT_MESSAGES = {
    400: 'Dados inválidos. Verifique os campos.',
    401: 'Faça login para continuar.',
    403: 'Você não tem permissão para esta ação.',
    404: 'Não encontrado.',
    409: 'Conflito com um registro existente.',
    429: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    503: 'O servidor está temporariamente indisponível.',
};

/**
 * Chama a API.
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
 * @param {string} path  caminho depois de /api, ex.: '/devices?status=online'
 * @param {object} [body] enviado como JSON
 */
export async function api(method, path, body) {
    const token = getToken();
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
        response = await fetch(`/api${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (err) {
        // O fetch só lança quando NÃO houve resposta: servidor fora do ar, rede caiu ou demorou demais.
        if (err.name === 'TimeoutError') {
            throw new ApiError(0, 'TIMEOUT', 'O servidor demorou demais para responder. Tente novamente.');
        }
        throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível falar com o servidor. Verifique se ele está no ar e tente de novo.');
    }

    if (response.status === 204) return null;

    let data = null;
    try {
        data = await response.json();
    } catch {
        // resposta sem JSON (raro): segue com data = null
    }

    if (response.ok) return data;

    const error = data?.error ?? {};
    const apiError = new ApiError(
        response.status,
        error.code ?? `HTTP_${response.status}`,
        error.message ?? DEFAULT_MESSAGES[response.status] ?? 'Algo deu errado. Tente novamente.',
        error.details,
    );

    // 401 com token = a sessão acabou (token expirado ou inválido): volta para o login.
    // (Sem token, é o próprio login falhando: quem chamou trata a mensagem.)
    if (response.status === 401 && token) {
        clearSession();
        window.location.replace('/login.html?motivo=expirada');
        return new Promise(() => {}); // nunca termina: a página não chega a mostrar o erro enquanto sai
    }

    throw apiError;
}
