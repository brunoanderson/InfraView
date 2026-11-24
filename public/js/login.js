// Página de login: valida no navegador, chama POST /api/auth/login e vai para o dashboard.
import { getToken, login, validateEmail } from './auth.js';
import { clearFieldErrors, setBusy, setFieldError, showFieldErrors } from './ui.js';

// Já está logado? Vai direto para o painel. (Se o token tiver vencido, o
// dashboard recebe 401 e manda de volta para cá, já sem o token.)
if (getToken()) window.location.replace('/dashboard.html');

const form = document.getElementById('loginForm');
const button = document.getElementById('loginButton');
const message = document.getElementById('formMessage');

function showMessage(text, type = 'danger') {
    message.className = `alert alert-${type}`;
    message.textContent = text;
}

function hideMessage() {
    message.className = 'alert d-none';
    message.textContent = '';
}

// Por que a pessoa chegou aqui (o api.js e o logout mandam ?motivo=...)
const REASONS = {
    expirada: ['Sua sessão expirou. Faça login novamente.', 'warning'],
    saiu: ['Você saiu do painel.', 'info'],
};
const reason = REASONS[new URLSearchParams(window.location.search).get('motivo')];
if (reason) showMessage(...reason);

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage();
    clearFieldErrors(form);

    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;

    // 1) Validação no navegador (resposta imediata, sem ir ao servidor)
    const emailError = validateEmail(email);
    if (emailError) setFieldError(form.elements.email, emailError);
    if (!password) setFieldError(form.elements.password, 'Informe a senha.');
    if (emailError || !password) {
        form.querySelector('.is-invalid').focus();
        return;
    }

    // 2) Envio: botão desabilitado até a resposta chegar
    setBusy(button, true, 'Entrando...');
    try {
        await login(email, password);
        window.location.replace('/dashboard.html');
    } catch (err) {
        setBusy(button, false);
        if (err.status === 400 && showFieldErrors(form, err.details)) return; // erros por campo da API
        if (err.status === 401) showMessage('E-mail ou senha inválidos.');
        else if (err.status === 429) showMessage(err.message, 'warning'); // muitas tentativas
        else showMessage(err.message); // ex.: servidor fora do ar
    }
});
