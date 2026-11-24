// =============================================================================
// poller.js — atualização automática das telas.
//
//   const poller = createPoller(carregarDados);   // carregarDados é async
//   poller.start();                               // roda agora e a cada 10 s
//   poller.refresh();                             // roda já (ex.: depois de salvar)
//
// Regras:
//   * Não empilha: a próxima rodada só é agendada quando a atual TERMINA. Se
//     refresh() for chamado no meio de uma rodada, roda mais uma logo depois.
//   * Aba oculta: para de buscar (economiza rede e servidor) e, ao voltar a
//     aparecer, atualiza na hora.
//   * Ao sair da página (pagehide), para de vez.
// =============================================================================
const DEFAULT_INTERVAL_MS = 10_000;

export function createPoller(task, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    let timer = null;
    let running = false;
    let runAgain = false;
    let stopped = false;

    function schedule() {
        clearTimeout(timer);
        if (!stopped && !document.hidden) timer = setTimeout(run, intervalMs);
    }

    async function run() {
        if (stopped) return;
        if (running) {
            runAgain = true; // já tem uma em andamento: roda de novo quando ela acabar
            return;
        }
        clearTimeout(timer);
        running = true;
        try {
            await task();
        } catch (err) {
            // Cada tela mostra seus próprios erros; aqui só evitamos que o
            // poller pare por causa de uma falha.
            console.debug('[poller] falha na atualização:', err?.message);
        } finally {
            running = false;
        }
        if (runAgain) {
            runAgain = false;
            run();
        } else {
            schedule();
        }
    }

    function onVisibilityChange() {
        if (document.hidden) clearTimeout(timer);
        else run();
    }

    function stop() {
        stopped = true;
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVisibilityChange);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', stop);

    return { start: run, refresh: run, stop };
}
