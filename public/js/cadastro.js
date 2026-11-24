// Página de cadastro: valida no navegador (mesmas regras do back-end), chama
// POST /api/auth/register e entra no painel já logado, como visualizador.
import { getToken, register, validateEmail, validateName, validatePassword } from './auth.js';
import { clearFieldErrors, hideFormMessage, setBusy, setFieldError, showFieldErrors, showFormMessage } from './ui.js';

if (getToken()) window.location.replace('/dashboard.html');

const form = document.getElementById('registerForm');
const button = document.getElementById('registerButton');
const message = document.getElementById('formMessage');
const field = (name) => form.elements.namedItem(name);

const showMessage = (text, type) => showFormMessage(message, text, type);
const hideMessage = () => hideFormMessage(message);

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage();
    clearFieldErrors(form);

    const name = field('name').value.trim();
    const email = field('email').value.trim();
    const password = field('password').value;
    const confirmPassword = field('confirmPassword').value;

    // 1) Validação no navegador
    const errors = {
        name: validateName(name),
        email: validateEmail(email),
        password: validatePassword(password),
        confirmPassword: password !== confirmPassword ? 'As senhas não são iguais.' : null,
    };
    for (const [fieldName, error] of Object.entries(errors)) {
        if (error) setFieldError(field(fieldName), error);
    }
    const firstInvalid = form.querySelector('.is-invalid');
    if (firstInvalid) {
        firstInvalid.focus();
        return;
    }

    // 2) Envio
    setBusy(button, true, 'Criando conta...');
    try {
        await register(name, email, password);
        window.location.replace('/dashboard.html?bemvindo=1');
    } catch (err) {
        setBusy(button, false);
        if (err.status === 400 && showFieldErrors(form, err.details)) return; // erros por campo da API
        if (err.status === 409) {
            setFieldError(field('email'), err.message); // "Já existe uma conta com este e-mail."
            field('email').focus();
        } else if (err.status === 429) {
            showMessage(err.message, 'warning');
        } else {
            showMessage(err.message);
        }
    }
});
