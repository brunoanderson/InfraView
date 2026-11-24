// =============================================================================
// auth.js — sessão do usuário no navegador.
//
// O token (JWT) e os dados do usuário ficam no localStorage. A interface usa o
// papel (admin ou viewer) só para ESCONDER botões; quem decide de verdade é o
// back-end, que recusa com 403 qualquer escrita de um viewer.
// =============================================================================
import { api } from './api.js';

const TOKEN_KEY = 'infraview.token';
const USER_KEY = 'infraview.user';

// ---- Sessão guardada ----------------------------------------------------

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
        return null;
    }
}

function saveSession({ token, user }) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

export const isAdmin = (user = getUser()) => user?.role === 'admin';

// ---- Ações --------------------------------------------------------------

/** POST /api/auth/login. Lança ApiError (401 senha errada, 429 muitas tentativas...). */
export async function login(email, password) {
    const data = await api('POST', '/auth/login', { email, password });
    saveSession(data);
    return data.user;
}

/** POST /api/auth/register. A conta nasce como viewer (o back-end garante). */
export async function register(name, email, password) {
    const data = await api('POST', '/auth/register', { name, email, password });
    saveSession(data);
    return data.user;
}

export function logout() {
    clearSession();
    window.location.replace('/login.html?motivo=saiu');
}

/**
 * Proteção de página: sem token, vai para o login. Com token, confirma com
 * GET /api/auth/me que a sessão ainda vale (se não valer, o api.js recebe 401
 * e manda para o login) e devolve o usuário atualizado.
 */
export async function requireAuth() {
    if (!getToken()) {
        window.location.replace('/login.html');
        return new Promise(() => {}); // a página para aqui enquanto sai
    }
    const { user } = await api('GET', '/auth/me');
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
}

// ---- Validação dos formulários (as MESMAS regras do back-end) -----------
// Cada função devolve a mensagem de erro, ou null se estiver tudo certo.

export function validateName(name) {
    const value = name.trim();
    if (value.length < 2) return 'O nome precisa ter pelo menos 2 caracteres.';
    if (value.length > 100) return 'O nome pode ter no máximo 100 caracteres.';
    return null;
}

export function validateEmail(email) {
    const value = email.trim();
    if (!value) return 'Informe o e-mail.';
    if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Informe um e-mail válido.';
    return null;
}

export function validatePassword(password) {
    if (password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (password.length > 72) return 'A senha pode ter no máximo 72 caracteres.';
    if (!/[A-Za-z]/.test(password)) return 'A senha precisa ter pelo menos uma letra.';
    if (!/\d/.test(password)) return 'A senha precisa ter pelo menos um número.';
    return null;
}
