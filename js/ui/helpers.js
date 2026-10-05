/**
 * ui/helpers.js
 * ------------------------------------------------------------------
 * Helpers de DOM e formatação compartilhados por todos os módulos de UI.
 * Sem fetch, sem innerHTML: só createElement / textContent /
 * classList / setAttribute / appendChild.
 * ------------------------------------------------------------------
 */

/** Ordem fixa em que as categorias aparecem no painel e nos filtros. */
export const ORDEM_CATEGORIAS = ['Rede Wi-Fi', 'Segurança', 'Energia', 'Outros'];

/**
 * Cria um elemento já com classes, texto e atributos.
 * @param {string} tag
 * @param {{classes?:string|string[], texto?:string, atributos?:Record<string,string>}} [opcoes]
 */
export function criarElemento(tag, { classes = [], texto, atributos = {} } = {}) {
    const elemento = document.createElement(tag);
    const listaDeClasses = Array.isArray(classes) ? classes : classes.split(' ').filter(Boolean);
    listaDeClasses.forEach((classe) => elemento.classList.add(classe));
    if (texto !== undefined && texto !== null) {
        elemento.textContent = texto;
    }
    Object.entries(atributos).forEach(([nome, valor]) => elemento.setAttribute(nome, valor));
    return elemento;
}

export function criarCelulaTexto(texto, classes = []) {
    return criarElemento('td', { classes, texto });
}

export function criarBadge(texto, corDeFundo) {
    return criarElemento('span', { classes: ['badge', corDeFundo], texto });
}

/** Linha única de "estado vazio" ocupando todas as colunas da tabela. */
export function criarLinhaVazia(colunas, mensagem, icone = 'bi-inbox') {
    const linha = document.createElement('tr');
    const celula = criarElemento('td', { classes: 'empty-state', atributos: { colspan: String(colunas) } });
    celula.appendChild(criarElemento('i', { classes: ['bi', icone] }));
    celula.appendChild(document.createTextNode(mensagem));
    linha.appendChild(celula);
    return linha;
}

/** Devolve uma CÓPIA da lista ordenada do mais recente para o mais antigo. */
export function ordenarPorDataDesc(lista, campo) {
    return [...lista].sort((a, b) => new Date(b[campo]) - new Date(a[campo]));
}

export function formatarDataHora(isoString) {
    const data = new Date(isoString);
    return Number.isNaN(data.getTime()) ? String(isoString) : data.toLocaleString('pt-BR');
}

/** Remove todos os filhos de um elemento sem usar innerHTML = ''. */
export function limparElemento(elemento) {
    while (elemento.firstChild) {
        elemento.removeChild(elemento.firstChild);
    }
}
