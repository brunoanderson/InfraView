/**
 * ui.js  (barrel)
 * ------------------------------------------------------------------
 * Ponto único de importação da camada de apresentação. Reexporta os
 * módulos de js/ui/ para que os orquestradores (main-*.js) continuem
 * fazendo `import { ... } from './ui.js'`.
 *
 *   ui/helpers.js       criarElemento, formatarDataHora, limparElemento...
 *   ui/feedback.js      mostrarErro, ocultarErro, definirBotaoOcupado...
 *   ui/dispositivos.js  tabela da tela Rede
 *   ui/alertas.js       lista/tabela de alertas, sino e badge do menu
 *   ui/dashboard.js     indicadores, categorias, tabela de offline
 *   ui/relatorios.js    tabela de logs e filtro de dispositivos
 *
 * Regra: nenhum módulo de UI faz fetch nem usa innerHTML.
 * ------------------------------------------------------------------
 */

export { mostrarErro, ocultarErro, definirBotaoOcupado, atualizarContagemResultados, limparFormulario } from './ui/feedback.js';
export { renderizarTabelaDispositivos, atualizarContadores } from './ui/dispositivos.js';
export {
    renderizarAlertas,
    renderizarAlertasRecentes,
    renderizarTabelaAlertas,
    atualizarContadoresAlertas,
    marcarFiltroAtivo,
    atualizarIndicadoresDeAlerta,
    atualizarBadgeAlertasAtivos,
} from './ui/alertas.js';
export {
    calcularResumoDashboard,
    renderizarIndicadoresDashboard,
    renderizarCategoriasDashboard,
    renderizarTabelaOffline,
    atualizarCarimboDeTempo,
} from './ui/dashboard.js';
export {
    renderizarTabelaLogs,
    popularFiltroDispositivos,
    atualizarBadgeRegistros,
} from './ui/relatorios.js';
