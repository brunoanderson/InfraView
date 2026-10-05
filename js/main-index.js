/**
 * main-index.js
 * ------------------------------------------------------------------
 * Orquestrador da tela de Login do InfraView.
 *
 * O login é SIMULADO (projeto acadêmico, sem backend de autenticação):
 *   1. intercepta o submit do formulário (addEventListener('submit'));
 *   2. cancela o comportamento padrão do navegador (e.preventDefault());
 *   3. valida o formato dos campos e mostra erro visual se necessário;
 *   4. redireciona para o dashboard via window.location.href.
 * ------------------------------------------------------------------
 */

import { mostrarErro, ocultarErro } from './ui.js';

const PAGINA_APOS_LOGIN = 'dashboard.html';
const TAMANHO_MINIMO_SENHA = 6;
const PADRAO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const elementos = {
    formulario: document.querySelector('#form-login'),
    campoEmail: document.querySelector('#campo-email'),
    campoSenha: document.querySelector('#campo-senha'),
    containerErro: document.querySelector('#area-erro'),
};

/**
 * Valida os campos do login.
 * @returns {{mensagem:string, campo:HTMLInputElement}|null} o primeiro problema encontrado, ou null se tudo estiver certo
 */
function validarCredenciais(email, senha) {
    if (!email) {
        return { mensagem: 'Informe o endereço de e-mail.', campo: elementos.campoEmail };
    }
    if (!PADRAO_EMAIL.test(email)) {
        return { mensagem: 'Informe um e-mail válido, por exemplo nome@exemplo.com.', campo: elementos.campoEmail };
    }
    if (!senha) {
        return { mensagem: 'Informe a senha.', campo: elementos.campoSenha };
    }
    if (senha.length < TAMANHO_MINIMO_SENHA) {
        return { mensagem: `A senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`, campo: elementos.campoSenha };
    }
    return null;
}

function tratarEnvioLogin(evento) {
    evento.preventDefault();

    const email = elementos.campoEmail.value.trim();
    const senha = elementos.campoSenha.value;

    const problema = validarCredenciais(email, senha);
    if (problema) {
        mostrarErro(problema.mensagem, elementos.containerErro);
        problema.campo.focus();
        return;
    }

    ocultarErro(elementos.containerErro);
    window.location.href = PAGINA_APOS_LOGIN;
}

function inicializar() {
    elementos.formulario.addEventListener('submit', tratarEnvioLogin);
}

document.addEventListener('DOMContentLoaded', inicializar);
