/**
 * ui/feedback.js
 * ------------------------------------------------------------------
 * Feedback visual genérico: erro, botão ocupado, contagem de resultados, formulário.
 * Sem fetch, sem innerHTML: só createElement / textContent /
 * classList / setAttribute / appendChild.
 * ------------------------------------------------------------------
 */

import { limparElemento } from './helpers.js';

/** Escreve "Exibindo X de Y <rótulo>" no elemento informado. */
export function atualizarContagemResultados(elemento, exibidos, total, rotulo) {
    elemento.textContent = `Exibindo ${exibidos} de ${total} ${rotulo}`;
}

/** Desabilita/habilita um botão enquanto uma requisição está em andamento. */
export function definirBotaoOcupado(botao, ocupado) {
    botao.disabled = ocupado;
    botao.setAttribute('aria-busy', String(ocupado));
}

/** Exibe uma mensagem de erro visível na tela (nunca apenas console.log). */
export function mostrarErro(mensagem, container) {
    limparElemento(container);
    container.classList.remove('d-none');

    const icone = document.createElement('i');
    icone.classList.add('bi', 'bi-exclamation-triangle-fill', 'me-2');
    container.appendChild(icone);

    const texto = document.createElement('span');
    texto.textContent = mensagem;
    container.appendChild(texto);
}

/** Oculta e limpa o container de erro. */
export function ocultarErro(container) {
    container.classList.add('d-none');
    limparElemento(container);
}

/** Reseta os campos do formulário de cadastro após um envio bem-sucedido. */
export function limparFormulario(formulario) {
    formulario.reset();
}
